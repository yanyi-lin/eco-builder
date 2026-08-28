// ========================= 共享 Hono app（Node 与 CF Workers 双运行时复用） =========================
// 从 Express 版 createApp 迁移（HONO-MIGRATION-PLAN §3 步骤2）。
// 约束：
// - 业务层零 node 内置模块、零 cloudflare: import（唯一例外：本文件不碰任何运行时专属 API）
// - 静态资源与 SPA fallback 不进共享层：Node 入口注入（serveStatic + notFound 覆盖），
//   Worker 入口由 CF 原生 Static Assets（assets + not_found_handling）处理
// - env 注入式：Node 传 process.env，Worker 传 c.env（createApp 默认 process.env）
// - fail-fast：createApp 立即 loadChatEnv 校验必填（缺配置即抛，Node 启动/测试同现状语义）

import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { handleChatRequest, loadChatEnv, type ChatEnv } from "./chat.js";

import {
  incrementRequest,
  DAILY_REQUEST_LIMIT,
  checkIpWindow,
  recordIpHit,
  acquireIpSlot,
  releaseIpSlot,
  IP_WINDOW_LIMIT,
  IP_CONCURRENCY_LIMIT,
} from "./rateLimit.js";

/** messages 数组条数上限（正常教学会话远低于此值） */
const MAX_MESSAGES = 40;
/** 单条消息 JSON 序列化后字符上限（含工具结果 part 的历史消息） */
const MAX_MESSAGE_CHARS = 8000;

/** Node 直连（无反代头）时从 @hono/node-server 注入的 env 取对端 socket 地址；
 *  Worker 的 c.env 无 incoming → 返回 null（CF 场景恒有 CF-Connecting-IP 头）。
 *  ::ffff:a.b.c.d（IPv4-mapped IPv6）规范化回 IPv4，保证桶 key 稳定。 */
function nodeSocketIp(env: unknown): string | null {
  const addr = (
    env as { incoming?: { socket?: { remoteAddress?: unknown } } } | undefined
  )?.incoming?.socket?.remoteAddress;
  if (typeof addr !== "string" || addr.trim().length === 0) return null;
  return addr.startsWith("::ffff:") ? addr.slice(6) : addr.trim();
}

/**
 * 解析客户端 IP：CF-Connecting-IP → X-Real-IP → XFF 首跳 → Node socket 直连 → "unknown"。
 * 信任前提：前两层头由前置代理覆写（宝塔 nginx proxy_set_header / CF 自动注入均满足）；
 * 无代理直连时伪造头只会让 attacker 分裂自己的桶，无法挤占他人额度。
 */
function resolveClientIp(c: Context): string {
  // 三个头的空值/去空格处理必须一致（空串头不能成为桶 key）
  const header = (name: string): string | null => {
    const v = c.req.header(name)?.trim();
    return v ? v : null;
  };
  const xff = header("X-Forwarded-For");
  return (
    header("CF-Connecting-IP") ??
    header("X-Real-IP") ??
    (xff ? (xff.split(",")[0]?.trim() || null) : null) ??
    nodeSocketIp(c.env) ??
    "unknown"
  );
}

/** 安全头（迁移自 Express 版 applySecurityHeaders，4 条保持现状一致） */
function applySecurityHeaders(c: { header: (name: string, value: string) => void }): void {
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

/** 读取环境变量来源（Node: process.env；Worker: c.env——process 在 nodejs_compat 下存在） */
function defaultEnvSource(): Record<string, unknown> {
  return typeof process !== "undefined" ? (process.env as Record<string, unknown>) : {};
}

/**
 * 构建共享 Hono app。
 * @param envSource 环境变量来源（默认 process.env）；Node 入口显式传 process.env，
 *        Worker 入口可不传（nodejs_compat 自动填充 vars+secrets）
 * @returns Hono 实例（Node 入口 app.fetch 传给 @hono/node-server；Worker 入口 export default）
 */
export function createApp(envSource?: Record<string, unknown>): Hono {
  // fail-fast：必填缺失即抛（启动时暴露配置错误；测试保持 createApp() 抛错语义）
  const env: ChatEnv = loadChatEnv(envSource ?? defaultEnvSource());

  const app = new Hono();

  // JSON body 大小限制（超限 413；256KB 足以容纳 40 条上限的完整 UIMessage 历史，
  // 收紧自 2MB——伪造超大历史直接放大 LLM token 成本，body 上限是第一道闸）
  app.use("/api/chat", bodyLimit({ maxSize: 256 * 1024 }));

  // 所有响应附带安全头（先于其他中间件与路由执行）
  app.use("*", async (c, next) => {
    applySecurityHeaders(c);
    await next();
  });

  // 健康检查（宝塔监控 / 部署验证用）
  app.get("/api/health", (c) => c.json({ ok: true, ts: Date.now() }));

  // AI 聊天端点（与 useChat 协议：POST { messages, id } → UIMessageStream）
  app.post("/api/chat", async (c) => {
    // per-IP 限流：resolveClientIp 见函数注释（信任前提与回退链）
    const ip = resolveClientIp(c);

    // 并发槽位检查（先查，避免窗口检查通过后并发已满导致槽位/计数不一致）
    if (!acquireIpSlot(ip)) {
      console.warn(
        `[rate-limit] 429 并发超限 ip=${ip} limit=${IP_CONCURRENCY_LIMIT} path=${c.req.path}`,
      );
      return c.json(
        { error: "该 IP 并发请求过多，请稍候重试。" },
        429,
        { "Retry-After": "10" },
      );
    }

    // 并发槽位生命周期覆盖整个请求（含 LLM 流式响应）；所有出口路径都必须释放
    try {
      return await handleChatWithLimits(c, ip);
    } finally {
      releaseIpSlot(ip);
    }
  });

  /** 槽位已占用后的剩余流程：per-IP 窗口 → 全局每日 → 解析 body → 转发 */
  async function handleChatWithLimits(c: Context, ip: string): Promise<Response> {
    // per-IP 滑动窗口
    const win = checkIpWindow(ip);
    if (!win.allowed) {
      console.warn(
        `[rate-limit] 429 窗口超限 ip=${ip} limit=${IP_WINDOW_LIMIT} retryAfter=${win.retryAfterSec}s path=${c.req.path}`,
      );
      return c.json(
        { error: `该 IP 请求过于频繁（每小时上限 ${IP_WINDOW_LIMIT} 次），请 ${win.retryAfterSec} 秒后再试。` },
        429,
        { "Retry-After": String(win.retryAfterSec) },
      );
    }

    // 全局每日请求限制（单进程内存计数；CF 多 isolate 下为 per-isolate 近似，见 README）
    const { allowed } = incrementRequest();
    if (!allowed) {
      console.warn(`[rate-limit] 429 每日上限 hit ip=${ip} path=${c.req.path}`);
      return c.json(
        {
          error: `今日请求次数已达上限（${DAILY_REQUEST_LIMIT.toLocaleString()}），剩余 0。请明日再试。`,
        },
        429,
        { "Retry-After": "3600" },
      );
    }
    recordIpHit(ip);

    // messages 条数/条长上限：伪造超长历史是 SEC-05 唯一真实成本攻击面
    const body = (await c.req.json().catch(() => ({}))) as { messages?: unknown; lang?: string };
    const lang = body.lang === "en" ? "en" : "zh"; // 界面语言（仅 zh/en，其他值回退中文）
    if (!Array.isArray(body.messages)) {
      return c.json({ error: "请求体需包含 messages 数组（UIMessage[]）" }, 400);
    }
    if (body.messages.length > MAX_MESSAGES) {
      return c.json({ error: `消息条数超限（最多 ${MAX_MESSAGES} 条）` }, 400);
    }
    for (const msg of body.messages) {
      if (JSON.stringify(msg ?? "").length > MAX_MESSAGE_CHARS) {
        return c.json({ error: `单条消息过长（最多 ${MAX_MESSAGE_CHARS} 字符）` }, 400);
      }
    }

    try {
      // 直接返回标准 Response（UIMessageStream）——Hono 原生支持，无需手动 pump
      return await handleChatRequest(body.messages, c.req.raw.signal, env, lang);
    } catch (err) {
      console.error("[api/chat] 处理失败:", err);
      return c.json({ error: "聊天服务内部错误" }, 500);
    }
  }

  // 未匹配路由：/api → JSON 404；其余（静态/SPA）由各入口的 notFound 覆盖处理
  app.notFound((c) => {
    if (c.req.path.startsWith("/api/")) {
      return c.json({ error: "Not Found" }, 404);
    }
    return c.text("Not Found", 404);
  });

  return app;
}
