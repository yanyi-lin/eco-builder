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
| **`test/`（本目录）** | 新增的单元/回归测试：worker 模式判定、曲线不可区分度 | `npm test` |
| **`src/**/*.test.ts`** | 既有 vitest 测试：微分方程（computeStep）、构建工具、可行性分类 | `npm test` |
| **`scripts/verify-feasibility.ts`** | 独立可行性校验脚本（鲸落/森林/竞争等 25 项场景），非 vitest | `npm run verify:feasibility` |

## 本目录现有测试

- **`mode-detection.test.ts`** — worker 模式判定逻辑（`worker/mode.ts` 纯函数）：
  构建模式 `[MODE: build]` 前缀检测、协议前缀剥离，含 issue #10 回归用例
  （工具 auto-continuation 时最后一条是 assistant 消息，仍应从最后一条 user 消息判定）。

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

- **`token-counter.test.ts`** — 全局请求计数器（`worker/TokenCounter.ts`）：首次 INSERT、
  连续累加、跨日期独立计数（每日重置）、get 查询。通过 mock `cloudflare:workers`
  的 `DurableObject` 基类在 node 环境实例化。

## 添加新测试的约定

- 新测试优先放本目录，命名 `*.test.ts`（vitest 自动发现，无需注册）。
- 若测试对象是 worker 端逻辑（依赖 `cloudflare:workers` / `@cloudflare/ai-chat` 运行时，
  无法在纯 node 环境实例化），请先把可测的纯逻辑抽取到独立模块（如 `worker/mode.ts`），
  再对纯函数编写测试。
- 涉及可行性分类的回归场景，可追加到 `scripts/verify-feasibility.ts`。
