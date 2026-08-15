// ========================= eco-builder Node 服务入口（迁移自 worker/index.ts） =========================
// 单一进程同时提供：POST /api/chat（AI 聊天）+ 静态资源（dist/）+ SPA fallback + 安全头 + 每日限流。
// 部署：`npm run build`（含 build:server）后 `node dist-server/index.js`；或宝塔 pm2 托管（见 README 部署节）。
//
// 迁移要点（MIGRATION-PLAN §3/§4）：
// - 同源部署 → 无需 CORS 配置（原 CF 版的 ALLOWED_ORIGINS 逻辑不再需要）
// - 安全响应头原样保留（防 XSS / 点击劫持 / MIME 嗅探）
// - 限流：内存计数（单进程），每日 20k 上限语义与 CF 版 TokenCounter 一致

import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { handleChatRequest, loadChatEnv } from "./chat.js";
import { incrementRequest, DAILY_REQUEST_LIMIT } from "./rateLimit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 前端构建产物目录（npm run build → dist/；本文件编译到 dist-server/，故回退两级到项目根）
const DIST_DIR = path.resolve(__dirname, "../dist");

/** 构造安全响应头（原样迁移自 worker/index.ts，防 XSS / 点击劫持 / MIME 嗅探） */
function applySecurityHeaders(res: express.Response): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

/** 把 web 标准 Response（UIMessageStream 流式 body）转发到 Express 响应 */
async function sendWebResponse(
  res: express.Response,
  response: Response,
): Promise<void> {
  res.status(response.status);
  for (const [key, value] of response.headers.entries()) {
    res.setHeader(key, value);
  }
  if (!response.body) {
    res.end();
    return;
  }
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch {
    // 客户端断开（useChat stop() / 网络中断）——无需额外处理，连接已关闭
    res.destroy();
  }
}

export function createApp(): express.Express {
  // 启动时校验环境变量（fail-fast：缺配置直接抛错，避免线上半死状态）
  loadChatEnv();

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "2mb" }));

  // 所有响应附带安全头
  app.use((_req, res, next) => {
    applySecurityHeaders(res);
    next();
  });

  // 健康检查（宝塔监控 / 部署验证用）
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, uptime: process.uptime() });
  });

  // AI 聊天端点（与 useChat 协议：POST { messages, id } → UIMessageStream）
  app.post("/api/chat", async (req, res) => {
    // 全局每日请求限制（单进程内存计数；语义同 CF 版 TokenCounter）
    const { allowed } = incrementRequest();
    if (!allowed) {
      res.status(429).json({
        error: `今日请求次数已达上限（${DAILY_REQUEST_LIMIT.toLocaleString()}），剩余 0。请明日再试。`,
      });
      return;
    }

    const body = (req.body ?? {}) as { messages?: unknown };
    if (!Array.isArray(body.messages)) {
      res.status(400).json({ error: "请求体需包含 messages 数组（UIMessage[]）" });
      return;
    }

    try {
      const response = await handleChatRequest(body.messages, req.signal);
      await sendWebResponse(res, response);
    } catch (err) {
      console.error("[api/chat] 处理失败:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "聊天服务内部错误" });
      }
    }
  });

  // 静态资源（前端构建产物）
  app.use(express.static(DIST_DIR, { index: "index.html" }));

  // SPA fallback：非 /api 且非静态文件 → 返回 index.html（Express 5 不用通配符路由，用中间件兜底）
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) {
      next();
      return;
    }
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });

  // /api 未匹配路由 → JSON 404
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not Found" });
  });

  return app;
}

// 直接运行时启动（被测试 import 时不启动，避免端口占用）
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const PORT = Number(process.env.PORT ?? 3000);
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`eco-builder server listening on http://localhost:${PORT}`);
    console.log(`静态资源目录: ${DIST_DIR}`);
  });
}
