# Agent 操作日志

> 供多 agent 协作时理解项目变更历史。每条记录包含：日期、操作者、修改内容、影响范围。

---

## 2026-08-10 — Qwen Code 第二轮审计修复

### 背景
基于第一轮 3-subagent 对抗式审查（AUDIT-REPORT.md，45 个问题），opencode 修复了 4🔴+1🟡 后，Qwen Code 进行第二轮修复。修复前经 3-subagent 验证确认 opencode 的 5 个修复全部正确（5/5 ✅，0 回归）。

### 本轮修复（4 项）

| # | 审计编号 | 修复内容 | 修改文件 |
|---|---------|---------|---------|
| 1 | #5 | **提取共享 computeStep 消除方程重复** — 新建 `src/eco/computeStep.ts`，将微分方程单步计算（logistic + predation + competition + mutualism 含 Holling Type II 饱和）提取为共享函数。`derivatives.ts` 委托 computeStep 后转换为导数形式；`feasibility.ts` 的 simulate 直接调用 computeStep，消除 ~40 行重复代码 | `src/eco/computeStep.ts`(新), `src/eco/derivatives.ts`, `src/tools/feasibility.ts` |
| 2 | #6 | **为核心纯函数添加单元测试** — 使用 vitest 框架，新增 `computeStep.test.ts`（6 个测试：logistic/predation/competition/mutualism/clamp/NaN）和 `feasibility.test.ts`（4 个测试：ok/structural-extinction/auto-fix/consistency）。10/10 全部通过 | `src/eco/computeStep.test.ts`(新), `src/tools/feasibility.test.ts`(新), `package.json` |
| 3 | #7 | **build-model/run-model 缓存 buildModel 结果** — 在 BuilderState 添加 `_cachedModel` + `_cacheKey` 字段，基于 JSON.stringify 生成缓存 key。连续调用 build-model + run-model 时复用结果，避免 ensureFeasible（4000步×最多18轮）重复计算 | `src/tools/builderTools.ts` |
| 4 | #21 | **add-relation 阻止自捕食** — 在 predation 分支添加 `if (prey === predator)` 检查，返回错误消息 | `src/tools/builderTools.ts` |

### 未修复（复杂度/收益比低，留作后续）

| # | 审计编号 | 问题 | 跳过原因 |
|---|---------|------|---------|
| - | #11 | CDN 脚本无 SRI | 需计算文件 integrity hash，无法在编辑工具中完成 |
| - | #24 | MessageList useMemo 依赖 msg 对象引用 | 需理解 ai 库内部引用行为，改动风险不确定 |
| - | #25 | BuilderPanel 关系列表用 index 作 key | 关系数量通常 <5，性能影响可忽略 |
| - | #26 | arr.shift() 热路径 O(n) | MAX_DATA_POINTS=900 规模可控，环形缓冲改动范围大 |
| - | #12 | Token 限制 per-DO 独立 | 需要 KV/D1 全局存储，架构变更 |
| - | #13 | 无请求速率限制 | 需要 KV 计数器，架构变更 |

### 验证结果
- TypeScript 类型检查：✅ 通过
- 单元测试：✅ 10/10 通过
- subagent 对抗审查：✅ 4/4 修复全部正确，无回归问题
  - computeStep 公式验证通过（logistic/predation/competition/mutualism 含 Holling Type II 饱和）
  - derivatives.ts 委托正确（dt=1 → 导数 = next - current）
  - feasibility.ts 的 simulate 直接调用 computeStep，无内联计算
  - 缓存逻辑正确，cacheKey 生成一致
  - 自捕食检查位置正确，错误信息清晰
  - lotkaVolterra3 内置模型无回归风险
  - 微小瑕疵：cacheKey 生成逻辑在 build-model/run-model 中重复（~10行），属代码风格层面

### 新增依赖
- `vitest` (devDependency) — 测试框架

### 新增文件
- `src/eco/computeStep.ts` — 共享微分方程计算
- `src/eco/computeStep.test.ts` — computeStep 单元测试
- `src/tools/feasibility.test.ts` — ensureFeasible 单元测试
