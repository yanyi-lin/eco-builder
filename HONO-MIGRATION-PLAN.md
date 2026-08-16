# Hono 双运行时迁移执行规划

> 状态：待执行（2026-08-16 定稿）。依据三份对抗式审查（Hono 跨运行时可行性 / CF 部署配置 / 测试与宝塔交付影响）交叉验证，方案成立。
> 目标：**不 CF 硬编码 + CF Workers 可部署（自定义域名）+ 宝塔/nginx 可部署**，同一份代码。

---

## 1. 目标与约束

| 约束 | 要求 |
|---|---|
| 不 CF 硬编码 | 业务层（server/chat|mode|tools|prompts|rateLimit）零 `cloudflare:` import、零 node 内置模块；仅 Worker 入口做适配 |
| CF Workers 可部署 | 同一 `createApp()` 的 fetch handler，`export default app`；静态走 CF 原生 assets；自定义域名 |
| 宝塔/nginx 可部署 | Node 入口保持 `server/index.ts` → 产物 `dist-server/index.js` 不变 → ecosystem/start/Dockerfile 零改动 |
| 步数配置化 | `BUILD_MAX_STEPS`（默认 60）/ `SIMULATE_MAX_STEPS`（默认 20）读环境变量；CF vars 设 40 规避 50 子请求墙，宝塔默认 60 |
| 限流 | best-effort 内存计数（per-isolate 近似），不引入 DO/KV；文档化 |

## 2. 执行流程（分支保护 + PR 规范，本仓库已生效）

- main 保护：CI 必须通过 + 1 人批准 + 禁 force push/删除（已配置，见会话记录）
- **所有变更走 PR**：feature 分支 → commit（作者 `yanyi-lin <yanyi_lin@126.com>`）→ push → `gh pr create` → CI 绿 → 自己 review（`gh pr review --approve`）→ 自己 merge（`gh pr merge`）
- 不做任何直接 push main、不做 force push
- 分支命名：`feat/hono-migration`（整体一个 PR，步骤内多次 commit，每 commit 有说明）

## 3. 分步计划（每步：做什么 + 检查什么）

| # | 步骤 | 做什么 | 检查（通过才算完成） |
|---|---|---|---|
| 0 | 依赖安装 | `npm i hono@^4.13.2 @hono/node-server@^2.1.1` + `npm i -D wrangler@^4.120` | `npm ls` 确认；typecheck 仍绿 |
| 1 | env 注入化 | `loadChatEnv(env)` 接收 env 参数；`handleChatRequest(messages, signal, env)`；`BUILD_MAX_STEPS`/`SIMULATE_MAX_STEPS` 从 env 读（默认 60/20） | typecheck；chat-server 协议测试仍绿（测试补 env） |
| 2 | 共享 Hono app | 新建 `server/app.ts`：`createApp()` 改 Hono——`bodyLimit({maxSize:"2mb"})` + `c.req.json().catch(()=>({}))` + 安全头自定义中间件（4 条 header 保现状）+ `/api/health` + POST `/api/chat`（`c.req.raw.signal` 传中止，`return response` 直接返回）+ `/api` 404 JSON；静态/SPA 不进共享层 | typecheck；app 层测试改造后绿 |
| 3 | Node 入口 | 重写 `server/index.ts`：`dotenv/config` + 解析 DIST_DIR（绝对路径）+ `serveStatic({root, index:"index.html"})` + SPA fallback（非 /api → index.html）+ `serve({fetch: app.fetch, port})` + isMain 守卫保留 | `npm start` 后 curl：`/api/health`、`/`(HTML)、`/some/route`(SPA)、POST `/api/chat`(流式) |
| 4 | Worker 入口 | 新建 `worker/index.ts`：`export default app`（仅 fetch）；**不含** dotenv / node:path / node:url | wrangler 打包校验通过 |
| 5 | wrangler.jsonc | name / `compatibility_date:"2026-08-04"` / main / `assets:{directory:"./dist", not_found_handling:"single-page-application"}` / vars(OPENAI_BASE_URL, OPENAI_MODEL, BUILD_MAX_STEPS:40) / `secrets:{required:["OPENAI_API_KEY"]}` | `wrangler types` 生成类型；`wrangler deploy --dry-run` 通过 |
| 6 | 测试适配 | `chat-server.test.ts` 挂具改 `createAdaptorServer`（HTTP 层 5 用例体零改动）；env 注入后的 fail-fast 测试同步 | `npm test` 全绿（93+ 用例） |
| 7 | 文档 | README：依赖节/文件结构更新 + 新增 CF Workers 部署节（assets 静态、限流 per-isolate 说明、步数配置、wrangler 命令、.dev.vars）；宝塔节不动 | README 通读无矛盾 |
| 8 | CF 本地冒烟 | `.dev.vars` 配真实 key（本地不入库）→ `wrangler dev` → GET `/`(SPA)、POST `/api/chat`(流式)、429 | 冒烟通过（含 stop() 中止回归：无 MissingToolResultsError） |
| 9 | CI 更新 + 最终回归 | ci.yml 增加 CF 打包校验步骤；全链 `npm run typecheck && npm test && npm run verify:feasibility && npm run build` | 本地全绿 → PR 后 GitHub CI 绿 → merge |

## 4. CI 内容（明确写啥，`.github/workflows/ci.yml`）

| 步骤 | 命令 | 目的 |
|---|---|---|
| checkout + setup-node 22 + npm ci | — | 环境 |
| typecheck | `npm run typecheck` | 前端 + server + worker 类型 |
| 单元/集成测试 | `npm test` | 93+ 用例（含新增的 Hono app 层） |
| 可行性回归 | `npm run verify:feasibility` | 数值可行性 25 场景 |
| 构建 | `npm run build` | 前端 dist + server dist-server |
| **新增：CF 打包校验** | `npx wrangler deploy --dry-run --outdir=...` | 验证 worker 入口可被 wrangler 打包（防 CF 侧回归），失败即 CI 红 |
| （可选，不开）CF 自动部署 | Actions + CLOUDFLARE_API_TOKEN/ACCOUNT_ID | 暂手动部署，留注释 |

## 5. 验收标准（整体 DoD）

- [ ] 宝塔：`npm ci && npm run typecheck && npm test && npm run build` 全绿；`npm start` 起服务，curl 三连正常
- [ ] CF：`wrangler dev` 冒烟通过；`wrangler deploy` 后自定义域名 `GET /` 出 SPA、`POST /api/chat` 流式正常
- [ ] 不硬编码：业务层 `grep -r "cloudflare:" server/` 0 命中（仅 worker/index.ts 入口适配）
- [ ] 步数：CF vars `BUILD_MAX_STEPS=40`；宝塔默认 60（两端不撞 50 子请求墙、宝塔更长）
- [ ] 限流：README 明确 per-isolate best-effort 语义
- [ ] 测试：93+ 全绿，HTTP 层 5 用例经 createAdaptorServer 真实 HTTP 覆盖

## 6. 风险与对策（三份审查要点，按严重度）

| 级 | 风险 | 对策 |
|---|---|---|
| 🔴 | 客户端中止（stop()）语义 | `c.req.raw.signal` 传给 `handleChatRequest`；步骤 8 手工回归（无 MissingToolResultsError） |
| 🔴 | 静态资源路径与 fallback 顺序 | serveStatic 绝对路径；顺序：static → 非 /api 兜底 → /api 404 JSON |
| 🟠 | body 解析 | `bodyLimit({maxSize:"2mb"})`（413）+ `c.req.json().catch(()=>({}))`（缺 messages → 400） |
| 🟠 | 安全头默认值≠现状 | 自定义 4 行 `c.header()` 中间件，保 nosniff/DENY/strict-origin-when-cross-origin/Permissions-Policy |
| 🟠 | 50 子请求/请求 | `BUILD_MAX_STEPS=40`（CF vars），宝塔默认 60 |
| 🟠 | workers.dev 国内不可达 | 自定义域名（CF 托管/CNAME），用户已有 |
| 🟡 | dotenv 进 Worker bundle 崩溃 | `dotenv/config` 只留 Node 入口；Worker 用 `.dev.vars`/secrets |
| 🟡 | 版本纪律 | 锁 hono@4.13.x + @hono/node-server@2.1.x；不参考 v3 API；不引入 ws |
| 🟡 | 流式开始后无法回 500 | handler 直接 `return response`，`app.onError` 兜底 handler 内抛错 |

## 7. 参考（三份对抗审查）

- Hono 跨运行时可行性：hono@4.13.2 + @hono/node-server@2.1.1 双入口成立；ai SDK v6 在 workerd 可用（6 包零 node:/cloudflare: 依赖）；`hono/json` 不存在；Workers 侧弃用 hono serveStatic 走 CF 原生 assets
- CF 部署配置：wrangler@4 assets 语法 + `not_found_handling: single-page-application` + `secrets.required`；nodejs_compat 2026-08-04 起默认；免费档 100k 请求/日、50 子请求/请求、静态不计费
- 测试与宝塔：93 用例 88 个零改动，HTTP 层 5 用例换 `createAdaptorServer` 挂具；ecosystem/start/Dockerfile 入口名不变则零改动
