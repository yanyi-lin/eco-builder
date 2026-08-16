// ========================= eco-builder CF Workers 入口 =========================
// HONO-MIGRATION-PLAN §3 步骤4。静态资源由 CF 原生 Static Assets 处理
//（wrangler.jsonc assets + not_found_handling），本入口只处理进入 Worker 的请求
//（/api/* 等非资产请求）。
// 约束：不得 import dotenv / node:path / node:url / server/index.ts（Node 专属入口）；
// 本文件是唯一允许存在的部署适配层（业务层零 cloudflare 依赖）。

import { createApp } from "../server/app.js";

// env 默认 process.env：nodejs_compat（2026-08-04 起默认开启）自动填充 vars+secrets
const app = createApp();

export default {
  // 显式箭头函数转发，避免 app.fetch 的 this 绑定丢失；
  // ctx 类型从 app.fetch 推导（hono 的 ExecutionContext）
  fetch: (
    request: Request,
    env: unknown,
    ctx: Parameters<typeof app.fetch>[2],
  ) => app.fetch(request, env, ctx),
};
