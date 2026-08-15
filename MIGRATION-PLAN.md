# eco-builder 脱离 Cloudflare 迁移计划

> 状态：已定稿（2026-08-15）。本文档是迁移工程的**目标与验收基准**，实现阶段对照执行。
> 前置结论来自三份对抗式审查（迁移方案 / 宝塔部署 / 安全基线），要点已内联引用。

---

## 1. 干什么（目标与范围）

**一句话目标**：把 AI 聊天后端从 Cloudflare Workers（agents SDK + AIChatAgent + DO SQLite）迁移为**纯 Node.js 服务**，使项目能在任意 Linux 服务器（宝塔面板 + nginx）或 WSL 上完整运行，**彻底脱离 Cloudflare 基础设施**；最终以小规模多用户（个位数并发）部署。

**范围（做什么）**：

| 模块 | 动作 |
|---|---|
| `worker/` 全部（EcoChatAgent / TokenCounter / index / mode） | 替换为 `server/`（Node 服务） |
| `src/components/ai/useEcoAgent.ts` | `useAgent`+`useAgentChat` → `useChat`（`@ai-sdk/react`） |
| `src/components/ai/MessageList.tsx` | 移除 `@cloudflare/ai-chat/react` 依赖，内联读 tool part 字段 |
| 构建产物 / 静态资源 | 由 Node 服务内置（Express static + SPA fallback） |
| 环境变量 | `.dev.vars`/wrangler → `.env`（dotenv）+ `ecosystem.config.cjs` env 段 |
| CDN 依赖（chart.js/marked/DOMPurify） | vendor 到 `public/vendor/`（本地化，~1 小时） |

**非目标（不做）**：
- 生态模拟核心（`src/eco/`、`src/tools/` 纯逻辑）——零改动，浏览器端执行不变；
- GBIF/GloBI 数据查询——浏览器端直连，不动；
- UI 视觉/交互改动；
- 保留 CF 部署：旧 `eco-agent.yanyi-lin.workers.dev` 保持在线直至切换完成，之后域名指向新服务器。

## 2. 分几步（阶段划分）

| 阶段 | 内容 | 输入 → 输出 | 工作量 |
|---|---|---|---|
| 0 | 前置验证 | 三份对抗审查 ✅（已完成） | — |
| 1 | **Node 后端** | `worker/EcoChatAgent.ts` 的 system prompt/工具 schema、`worker/mode.ts`、`worker/index.ts` 安全头 → `server/index.ts`（POST /api/chat + 静态 + SPA fallback + 安全头 + 内存限流）、`server/chat.ts`、`.env.example` | 1 天 |
| 2 | **前端迁移** | `useEcoAgent.ts`、`MessageList.tsx` → useChat 版本（见 §4 实现要点 8 条），移除 `agents` / `@cloudflare/ai-chat` 依赖 | 0.5～1 天 |
| 3 | **本地验证（WSL）** | `npm run dev` + `node server` 全链路 | 0.5 天 |
| 4 | **测试与 CI** | 现有 77 项保持 + 新增后端集成测试（见 §6） | 0.5 天 |
| 5 | **宝塔交付物** | `ecosystem.config.cjs`、README 宝塔部署节、`engines` 字段 | 0.25～0.5 天 |
| 6 | **清理** | 删除 `worker/`、`wrangler.jsonc`、CF 依赖（agents/ai-chat/partyserver）；更新 README/design.md | 0.25 天 |

**合计 ≈ 2.5～3.5 天**。

## 3. 如何验收（每阶段 + 整体）

- **阶段 1**：`curl -X POST localhost:3000/api/chat`（带 messages）返回 UIMessageStream（text/plain 流）；`curl localhost:3000/` 返回 index.html；未知路径返回 SPA fallback。
- **阶段 2**：`npm run typecheck` 通过；构建模式连续工具调用（add-species×N）不触发 React #185。
- **阶段 3**（WSL 全链路，最关键）：① 模拟模式：read-animal-data / animal-population-set / start / pause / restart 各走一遍；② 构建模式："构建森林生态系统"全流程（search-species → add-species → query-interactions → add-relation → run-model）走通且自动续流到 run-model 停止；③ 中断：流式时点 stop()，无 MissingToolResultsError；④ 刷新页面行为与 CF 版一致（丢会话，可接受）。
- **阶段 4**：`npm test` 全绿（原 77 + 新增）；`npm run verify:feasibility` 通过；GitHub CI（`Typecheck + Tests + Build`）绿。
- **阶段 5**：按部署文档在宝塔面板（11.0+）走完 5 条注意事项（§5），服务器重启后应用自动恢复。
- **整体验收（DoD 汇总）**：`npm ci && npm run typecheck && npm test && npm run build` 全绿 + WSL 完整演示 + 宝塔服务器部署验证 + README 无 CF 部署残留。

## 4. 怎样算合格（实现要点，来自审查，必须逐条落实）

| # | 要点 | 说明 |
|---|---|---|
| 1 | `useChat` 从 **`@ai-sdk/react`** 导入 | ai@6 无 `ai/react` 子路径；`id` 沿用现有 sessionId |
| 2 | **显式配 `sendAutomaticallyWhen`** | 新版默认关闭自动续流；不配则工具执行后 agent 停摆（等价 CF `autoContinueAfterToolResult: true`）🔴 |
| 3 | `convertToModelMessages(clean, { ignoreIncompleteToolCalls: true })` | 防中止残留的 `input-available` part 触发 MissingToolResultsError 🔴 |
| 4 | `stopWhen` 照搬 | `hasToolCall("run-model")` + `stepCountIs(60)`（构建）/ `stepCountIs(20)`（模拟） |
| 5 | `[MODE: build]` 前缀协议保留 | 前端注入 + `MessageList` 显示剥离不变；服务端每 POST 重跑 `detectBuildMode`+`stripModePrefix`（mode.ts 原样复用） |
| 6 | 工具串行化 | SDK 层已强制串行（`await onToolCall`）；`experimental_throttle` 必须保留；原 toolChainRef 可留作双保险 |
| 7 | `MessageList` 内联读取 | `getToolInput`/`getToolOutput`（ai v6 不导出）改读 `part.input`/`part.output`（按 state 守卫）；`getToolName`/`isToolUIPart` 从 `ai` 导入 |
| 8 | `z` 从 `zod` 导入 | ai 包不导出 z；`toUIMessageStreamResponse()` 原样返回（Node 可用）；**不支持 resume-stream**（返回 4xx） |

**行为等价基准**：12 个工具全部保留；构建模式 prompt 约束（只建用户点名物种等）原样搬移；系统提示全文复用。

**工程规范**（AGENTS.md）：生成代码带注释；commit 说明；API key 只走环境变量；不用 git 追踪密钥。

## 5. 宝塔部署注意事项（写入 README 部署节，部署者非开发者）

1. 面板需 **11.0+ 且 Node 版本管理器 2.7+**；先装插件 → 装 Node 20/22 LTS → **设置命令行版本**（列表不全先"更新版本列表"）。
2. 添加 Node 项目：运行用户 **www**、端口 **3000**、Node 版本选已装版本；**`ecosystem.config.cjs` 的 `apps[].name` 必须与宝塔项目名完全一致**（否则面板显示"未启动"）。
3. 环境变量（OPENAI_API_KEY 等）写进 **`env` 段**（或面板"环境变量"栏）；**禁用 `env_production`**（宝塔执行 `pm2 start` 不带 `--env production`，不注入）。
4. 开机自启非默认：计划任务 `@reboot /bin/bash /www/server/nodejs/vhost/scripts/{项目名}.sh &`；**交付后实测一次服务器重启**。
5. 防火墙/安全组只放行 80/443；nginx 反代 `127.0.0.1:3000`（宝塔"网站→反向代理"标准操作，Node 内置静态无需再配静态目录）；切换 Node 版本后面板点"重启"确认 pm2 用新版本。
6. Node 服务用单进程（`instances: 1` + `exec_mode: "fork"`）+ 内存限流 → 无文件写入 → www 用户权限无坑；重启限流清零（教学场景可接受）。

## 6. 如何写新的检查（测试规范）

**位置约定**：与现有一致——纯函数测试放 `src/**/*.test.ts`；跨模块/后端集成测试放 `test/`。命名 `*.test.ts`，vitest，describe/it 用中文描述。

**新增测试清单**（阶段 4 交付）：

| 测试 | 位置 | 覆盖 |
|---|---|---|
| mode 判定回归 | `test/`（现有 `mode-detection.test.ts` 迁移/保留） | `[MODE: build]` 前缀判定与剥离 |
| chat 端点-正常流 | `test/chat-server.test.ts` | POST /api/chat 返回 UIMessageStream；含系统提示注入 |
| chat 端点-工具输出 | `test/chat-server.test.ts` | 带 tool part 的 messages 往返转换（`ignoreIncompleteToolCalls` 生效） |
| chat 端点-限流 | `test/chat-server.test.ts` | 内存限流计数与 429 响应 |
| 静态资源 | `test/chat-server.test.ts` | / 返回 HTML；未知路径 SPA fallback；安全头存在 |

**写法约束**：mock 网络（不真调 OpenAI/GBIF/GloBI）；不依赖真实 API key；每个新测试注释关联迁移要点编号（§4）；`npm test` 与 CI 必须保持全绿。
