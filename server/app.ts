// ========================= 共享 Hono app（Node 与 CF Workers 双运行时复用） =========================
// 从 Express 版 createApp 迁移（HONO-MIGRATION-PLAN §3 步骤2）。
// 约束：
// - 业务层零 node 内置模块、零 cloudflare: import（唯一例外：本文件不碰任何运行时专属 API）
// - 静态资源与 SPA fallback 不进共享层：Node 入口注入（serveStatic + notFound 覆盖），
//   Worker 入口由 CF 原生 Static Assets（assets + not_found_handling）处理
// - env 注入式：Node 传 process.env，Worker 传 c.env（createApp 默认 process.env）
// - fail-fast：createApp 立即 loadChatEnv 校验必填（缺配置即抛，Node 启动/测试同现状语义）

import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { handleChatRequest, loadChatEnv, type ChatEnv } from "./chat.js";
import { incrementRequest, DAILY_REQUEST_LIMIT } from "./rateLimit.js";

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

  // 所有响应附带安全头（先于其他中间件与路由执行）
  app.use("*", async (c, next) => {
    applySecurityHeaders(c);
    await next();
  });

  // JSON body 大小限制（超限 413；语义同原 express.json({ limit: "2mb" })）
  app.use("/api/chat", bodyLimit({ maxSize: 2 * 1024 * 1024 }));

  // 健康检查（宝塔监控 / 部署验证用）
  app.get("/api/health", (c) => c.json({ ok: true, ts: Date.now() }));

  // AI 聊天端点（与 useChat 协议：POST { messages, id } → UIMessageStream）
  app.post("/api/chat", async (c) => {
    // 全局每日请求限制（单进程内存计数；CF 多 isolate 下为 per-isolate 近似，见 README）
    const { allowed } = incrementRequest();
    if (!allowed) {
      return c.json(
        {
          error: `今日请求次数已达上限（${DAILY_REQUEST_LIMIT.toLocaleString()}），剩余 0。请明日再试。`,
        },
        429,
      );
    }

    // 坏 JSON / 空 body 回落空对象，保持"缺 messages → 400"语义
    const body = (await c.req.json().catch(() => ({}))) as { messages?: unknown; lang?: string };
    const lang = body.lang === "en" ? "en" : "zh"; // 界面语言（仅 zh/en，其他值回退中文）
    if (!Array.isArray(body.messages)) {
      return c.json({ error: "请求体需包含 messages 数组（UIMessage[]）" }, 400);
    }

    try {
      // 直接返回标准 Response（UIMessageStream）——Hono 原生支持，无需手动 pump
      return await handleChatRequest(body.messages, c.req.raw.signal, env, lang);
    } catch (err) {
      console.error("[api/chat] 处理失败:", err);
      return c.json({ error: "聊天服务内部错误" }, 500);
    }
  });

  // 未匹配路由：/api → JSON 404；其余（静态/SPA）由各入口的 notFound 覆盖处理
  app.notFound((c) => {
    if (c.req.path.startsWith("/api/")) {
      return c.json({ error: "Not Found" }, 404);
    }
    return c.text("Not Found", 404);
  });

  return app;
}
