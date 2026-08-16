# 双语支持执行规划（zh/en）

> 状态：定稿（2026-08-16）。依据三份对抗式审查（前端 i18n / AI 语言跟随 / 数据层影响面）交叉验证 + 用户决策修正。
> 关键决策：**语言检测交给 LLM 自己判断**（prompt 语言跟随指令），服务端不做规则检测；界面语言仅作"无法判断时"兜底。按钮只有 中/EN，其他语言输入象征性适配（按英文回复）。

---

## 1. 目标与决策

| 决策点 | 结论 |
|---|---|
| 语言范围 | 仅 zh/en；按钮只有"中/EN"；其他语言输入象征性适配（prompt 指示按英文回复） |
| 语言检测 | **LLM 自判**（prompt 指令），不做服务端规则检测——LLM 跟随用户语言是天然能力，比 CJK 规则更准 |
| 界面语言传递 | `useChat({ transport: new HttpChatTransport({ body: () => ({ lang }) }) })`——body 必须是**函数**（每次请求重求值），不能是 useChat 的 `body` 选项（死选项 + 续发轮次丢失） |
| AI 回复语言 | prompt 指令："使用与用户输入相同的语言（仅中文/英文）；无法判断时使用\<界面语言\>" |
| 工具输出 | **不双语化**（成本高 + 砸 15 处测试断言）——prompt 加"工具返回可能为中文，须用回复语言转述，不得原样引用"指令 |
| 动态模型名 | 用户数据（任意中文输入），**保留原文**，只翻静态 UI |
| 结构字段 | `FeasibilityStatus`/`extinctSpecies`/`coincident` 绝不本地化（LLM 与测试双重依赖） |

## 2. 分步计划（每步：做什么 + 测什么）

| # | 步骤 | 做什么 | 测试（通过才算完成） |
|---|---|---|---|
| L0 | 语言基础设施 | `src/i18n/`：`LanguageProvider` + `useI18n` + `messages.ts`（`satisfies Record<Lang, Messages>` 类型约束，值为 ReactNode 防 XSS）+ 右上角"中/EN"按钮 + `navigator.language` 自动检测 + localStorage 记忆（try/catch）+ `?lang=` 优先级（按钮同步 `history.replaceState`） | 新增 `use-i18n.test.tsx`：无 Provider 默认 zh 不抛错、Provider 切换后 `t()` 返回对应文案、localStorage 记忆、URL 优先级 |
| L1 | 数据层双语 | `types.ts` 加**可选** `name_en`/`description_en`/`label_en`/`title_en`；`displayName(spec, lang)` helper；`lotkaVolterra3.ts` 补 en 值（物种名/参数标签/轴标题）；消费点替换（useEcoChart label/轴、CustomLegend、DisturbPanel、BuilderPanel、EcoTunerModal、App 标题） | 现有 93 测试**零破碎**（可选字段）；新增 displayName 单测（有 en 用 en、无 en 回退原文） |
| L2 | 前端文案 i18n | 10 组件 + ErrorBoundary/ModelSelector/App/index.html（lang+title）静态文案 `t()` 化 | 新增文案表完整性测试（zh/en key 对齐，`satisfies` 编译期保证）；typecheck/build 绿 |
| L3 | AI 语言跟随 | `handleChatRequest` 加**可选第 4 参 `lang?: string`**（默认 "zh"，不碎现有测试）；`server/prompts.ts` 两个 prompt 改语言指令（**保留"构建模式/模拟模式"关键词**，防 chat-server.test.ts:228/240 断言碎）+ 工具转述指令；前端 transport body 传 lang；app.ts 读 `body.lang` 传参 | 协议层 7 用例**零改动**通过；新增：app 层 POST 带 lang → mock LLM 断言 system 含语言指令；续发轮次 body 仍带 lang（transport 级验证）；prompt 关键词保留断言 |
| L4 | 图表语言切换 | 语言切换不重建 Chart 实例：patch `chart.options.scales.*.title.text` + tooltip 回调换新闭包 + `chart.update("none")`；locale **不进** effect deps | 手工验证：切换语言后轴标题/图例即时更新、曲线可见性不丢 |

## 3. CI 内容（`.github/workflows/ci.yml`）

现有步骤**结构不变**（typecheck / npm test / verify:feasibility / build / CF bundle check），新增测试自然被 `npm test` 覆盖：

| 步骤 | 说明 |
|---|---|
| typecheck | 含 tsconfig.worker（语言改动波及 server/worker 时） |
| `npm test` | 93 现有 + 新增（use-i18n、displayName、lang 传递、prompt 注入） |
| verify:feasibility | 数值可行性 25 场景（数据层加字段不影响） |
| build | 前端 + server + worker 编译 |
| CF bundle check | `wrangler deploy --dry-run`（transport body 改动不涉及 Worker 入口，保持） |

## 4. 测试影响面（会碎 / 需同步改 / 零改动）

| 类别 | 文件 | 处理 |
|---|---|---|
| **零改动** | 协议层 7 用例（chat-server.test.ts:122-242）、数据层夹具（as cast）、use-eco-agent-loop、rate-limit、mode-detection | 可选字段 + 可选第 4 参 + prompt 保留关键词 |
| **需同步改**（仅当本地化这些文案时） | `curve-overlap.test.ts:67`（"接近灭绝"）、`builder-tools.test.ts` 8 处中文 error、`eco-tools.test.ts:64/109` | **本方案不本地化工具输出** → 不改 |
| **新增** | use-i18n.test.tsx、displayName 单测、lang 传递集成测试、prompt 注入断言 | 见 §2 各层 |

## 5. 红线（三份审查共识，违反即返工）

1. 结构字段（status/extinctSpecies/coincident）绝不本地化
2. 数据层字段只能**可选**（必填碎全部测试夹具 typecheck）
3. `reason`/`message` 中文被测试+prompt 双重引用——本地化需同步改，本方案不做
4. 动态模型名保留原文，只翻静态 UI
5. 输入语言 > 界面语言（LLM 判断）；进行中流不中途换语言；历史不重答

## 6. 风险与对策（审查要点）

| 级 | 风险 | 对策 |
|---|---|---|
| 🔴 | useChat `body` 死选项 + 续发丢 body | transport 级 `body: () => ({lang})` 函数体（审查实证） |
| 🔴 | Chart 语言切换残留旧语言 | patch options + update("none")，不重建、locale 不进 deps |
| 🔴 | 无 Provider 裸渲染（jsdom 测试） | useI18n 默认 zh 不抛错 |
| 🟠 | 历史语言偏见（中文历史+英文提问） | 语言指令放首行并明示"只取决于最新消息语言" |
| 🟠 | `?lang=` 覆盖按钮（点了没反应） | 按钮同步 `history.replaceState` |
| 🟠 | jsdom navigator.language=en-US 翻转默认值 | 自动检测仅"首次且无记忆"时生效，测试环境显式注入 |
| 🟡 | 工具输出中文割裂 | prompt 转述指令（单点覆盖） |
| 🟡 | 前端不展示 chat.error（429/400/500 双语无意义） | L4 暂缓；若做先补错误横幅 |

## 7. 执行流程（PR 规范，沿用）

- 每层一个 commit（同一 PR `feat/bilingual` 或多 PR），走 feature 分支 → 用户名义提交 → PR → CI 绿 → 自己 review → 自己 merge
- 禁止直接 push main、禁止 force push

## 8. 参考（三份对抗审查）

- 前端 i18n：数据层中文是最大遗漏（spec 数据直出 UI）；手写 i18n 合理（99 处）；ReactNode 值防 XSS；图表不重建
- AI 语言跟随：transport body 通道（#1/#2 核心风险）；LLM 自判语言优于规则检测（用户决策）；prompt 保留关键词；工具输出用转述指令
- 数据层：可选 en 字段 + displayName 零测试破坏；结构字段红线；动态名保留原文
