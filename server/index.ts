// ========================= eco-builder Node 入口（宝塔 pm2 / 本地开发） =========================
// HONO-MIGRATION-PLAN §3 步骤3。职责：dotenv 加载 + 静态资源（serveStatic 绝对路径）+
// SPA fallback + @hono/node-server 启动。业务逻辑全部在共享层 server/app.ts。
// 注意：dotenv 与 node:path/node:url/fs 只允许出现在本入口（Worker 入口不得 import 本文件）。

import "dotenv/config";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createApp } from "./app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 前端构建产物目录（npm run build → dist/；本文件编译到 dist-server/，故回退两级到项目根）
const DIST_DIR = path.resolve(__dirname, "../dist");

// 启动时读入 index.html（SPA fallback 用；文件缺失时构建产物不完整，直接抛错暴露问题）
const INDEX_HTML = fs.readFileSync(path.join(DIST_DIR, "index.html"), "utf-8");

// createApp 第一个参数即 envSource（直接传 process.env，勿再包装）
const app = createApp(process.env);

// 静态资源（构建产物；绝对路径避免 cwd 依赖）
app.use("*", serveStatic({ root: DIST_DIR, index: "index.html" }));

// SPA fallback：非 /api 且未命中静态 → index.html（覆盖共享层 notFound；顺序：
// 安全头 → serveStatic → 路由 → notFound）
app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) {
    return c.json({ error: "Not Found" }, 404);
  }
  return new Response(INDEX_HTML, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});

// 直接运行时启动（被测试 import 时不启动，避免端口占用）
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const PORT = Number(process.env.PORT ?? 3000);
  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`eco-builder server listening on http://localhost:${info.port}`);
    console.log(`静态资源目录: ${DIST_DIR}`);
  });
}

export { app };
