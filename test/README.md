# 测试目录

本目录存放新增的自动化测试，采用 [vitest](https://vitest.dev/) 框架。

## 如何运行

```bash
npm test              # 运行全部 vitest 测试（含本目录 test/ 与 src/ 内联测试）
npm run typecheck     # 类型检查
npm run verify:feasibility  # 运行独立的可行性校验脚本（25 项场景）
```

## 测试组织

本项目的测试分布在三处，各司其职：

| 位置 | 内容 | 运行方式 |
|---|---|---|
| **`test/`（本目录）** | 单元/集成测试：模式判定、曲线不可区分度、后端 chat 协议、限流 | `npm test` |
| **`src/**/*.test.ts`** | 既有 vitest 测试：微分方程（computeStep）、构建工具、可行性分类 | `npm test` |
| **`scripts/verify-feasibility.ts`** | 独立可行性校验脚本（鲸落/森林/竞争等 25 项场景），非 vitest | `npm run verify:feasibility` |

## 本目录现有测试

- **`mode-detection.test.ts`** — 模式判定逻辑（`server/mode.ts` 纯函数，自 worker 迁移）：
  构建模式 `[MODE: build]` 前缀检测、协议前缀剥离，含 issue #10 回归用例
  （工具 auto-continuation 时最后一条是 assistant 消息，仍应从最后一条 user 消息判定）。

- **`chat-server.test.ts`** — Node 后端集成测试（`server/`）：
  协议层（mock LLM fetch：纯文本流/工具调用流/`convertToModelMessages` 转 tool 消息/
  `ignoreIncompleteToolCalls` 残缺 part/[MODE: build] 前缀剥离与系统提示选择）
  + app 层（健康检查/静态服务/安全头/SPA fallback/400/429 限流/env fail-fast）。

- **`rate-limit.test.ts`** — 全局每日请求限额（`server/rateLimit.ts` 内存版，
  替代已废弃的 CF `worker/TokenCounter.ts`）：首次计数、累加、跨日重置、超限拒绝。

- **`curve-overlap.test.ts`** — 竞争曲线"不可区分度"检测（`detectCurveOverlap`）：
  对称竞争判糊、不对称竞争不判、类对称反相/崩溃/贴地豁免、捕食关系不参与检测。

- **`builder-tools.test.ts`** — 构建工具纯函数与执行器：
  `autoSpeciesKeys` / `inferDefaultParams` / `addRelationParams`（捕食/竞争/互利参数生成、
  捕食率 clamp、predatorDeathRate 写回、默认不对称竞争）/ `buildModel` /
  `executeBuilderTool`（add-species/add-relation 校验、get-current-model、run-model）。

- **`eco-tools.test.ts`** — 模拟工具（`ecoTools.ts`）：`readAnimalData` 快照、
  `animalPopulationSet` 必须先读约束、start/pause/restart、`executeTool` 分发。

- **`feasibility-extra.test.ts`** — `ensureFeasible` 补充场景：竞争/互利对手再生来源、
  鲸落结构性灭绝、纯竞争耗竭、生态金字塔、互利饱和。

- **`derivatives.test.ts`** — `derivatives` 实时导数与 `computeStep(dt=1, skipClamp)`
  一致性、捕食/竞争方向性验证。

## 添加新测试的约定

- 新测试优先放本目录，命名 `*.test.ts`（vitest 自动发现，无需注册）。
- 后端逻辑测试（`server/`）不依赖真实网络：LLM 调用用 `vi.stubGlobal("fetch", ...)`
  mock（见 `chat-server.test.ts` 的 `mockLLM` helper），不携带真实 API key。
- 涉及可行性分类的回归场景，可追加到 `scripts/verify-feasibility.ts`。
