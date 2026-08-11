# 🌿 生态学教学演示：AI 引导式生态模型构建器

基于 **Lotka-Volterra 模型**的交互式生态学教学工具，面向高中生物学教学（选择性必修2《生物与环境》）。支持两类用法：

- **模拟模式**：观察内置"植物-雪兔-猞猁"三营养级系统的周期性波动，实时扰动、调参。
- **构建模式**：通过自然语言让 **AI 助手**帮你构建任意生态模型（捕食/竞争/互利），并自动做数值可行性校验。

---

## ✨ 特性

### 模拟模式
- **三营养级动态模拟**：植物（资源）→ 雪兔（初级消费者）→ 猞猁（次级消费者），呈现典型时滞性周期振荡。
- **双 Y 轴图表**：生产者密度（左轴）与消费者密度（右轴）独立刻度，曲线清晰。
- **交互控制**：▶️ 开始 / ⏸️ 暂停 / 🔄 重置模拟。
- **生态扰动实验**：一键减少任意种群 10% / 30% / 50%，观察系统恢复力。
- **Eco-Tuner**：调节动力学参数与初始种群数量。

### 构建模式（AI 引导）
- **自然语言构建**：说"构建森林生态系统"或"构建大小草履虫竞争培养液"，AI 自动查数据、加组分、定关系、跑模拟。
- **多关系支持**：捕食（predation）、竞争（competition）、互利（mutualism）。
- **数据驱动**：GBIF 查物种拉丁名、GloBI 查物种间交互关系。
- **可行性自动校验**：构建后自动执行"检测 → 修改 → 再检测"循环——
  - **参数性灭绝**（如捕食过强）→ 自动调参修复（`adjusted`）
  - **结构性必然灭绝**（如鲸落：无生产者）→ 不运行、提示调整结构（`structural-extinction`）
  - **生态金字塔约束**：捕食者数量不应超过猎物，自动修正
- **竞争/资源耗竭建模**：支持 Gause 竞争排斥实验（有限培养液耗尽 → 双方归零）。
- **组分数量不限**（软护栏 20 个），构建大型食物网。

---

## 🖥️ 部署

### 方式一：本地开发

```bash
npm install
npm run dev          # http://localhost:5173（模拟器可独立运行）
```

### 方式二：Cloudflare Workers 部署（含 AI 助手）

```bash
npm install
npm run build                 # 构建前端到 dist/

# 本地开发（含 AI）
cp .dev.vars.example .dev.vars   # 填入 OPENAI_API_KEY
npx wrangler dev

# 生产部署
npx wrangler secret put OPENAI_API_KEY
npx wrangler deploy
```

### 方式三：Cloudflare Workers Builds（Git 自动部署）

| 设置项 | 值 |
|--------|-----|
| Root directory | 仓库根（含 `wrangler.jsonc` 的目录） |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |

环境变量在 **Settings → Build → Build Variables and Secrets** 配置（`OPENAI_API_KEY` 设为 Secret）。

---

## 🔧 环境变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `OPENAI_BASE_URL` | OpenAI 兼容 API base URL（`/chat/completions` 自动拼接） | `https://api.deepseek.com` |
| `OPENAI_MODEL` | 模型名 | `deepseek-v4-flash` |
| `OPENAI_API_KEY` | API Key（secret，不入 wrangler.jsonc） | `sk-...` |

- `OPENAI_BASE_URL` 与 `OPENAI_MODEL` 在 `wrangler.jsonc` 的 `vars` 配置。
- `OPENAI_API_KEY` 用 `wrangler secret put` 设置（生产）或 `.dev.vars`（本地，已 gitignore）。
- 兼容任意 OpenAI Chat Completions 兼容端点（DeepSeek / 官方 OpenAI / 第三方网关 / Ollama），由 `@ai-sdk/openai-compatible` 驱动。

---

## 🤖 AI 助手与工具

AI 助手基于 **Cloudflare Agents SDK**（`AIChatAgent` + `useAgentChat`）实现：Worker 端声明工具 schema（不提供 `execute`），实际执行在浏览器 `onToolCall` 中直接操作模拟器/构建器状态，`autoContinueAfterToolResult` 自动续轮。

### 模拟模式工具

| 工具 | 作用 |
|------|------|
| `read-animal-data` | 读取物种列表、各物种数量、关系与运行状态。 |
| `animal-population-set` | 设置物种数量（部分更新）。**调用前必须先 read。** |
| `start` / `pause` / `restart` | 启动 / 暂停 / 重置模拟。 |

### 构建模式工具

| 工具 | 作用 |
|------|------|
| `search-species` | 从 GBIF 搜索物种分类信息（拉丁名、置信度）。 |
| `query-interactions` | 从 GloBI 查询两物种间交互（仅返回涉及两物种的记录）。 |
| `add-species` | 添加物种（id / 名称 / 初始数量 / hasLogistic / 增长率 / 容纳量 / 死亡率）。 |
| `add-relation` | 添加关系（捕食 / 竞争 / 互利），系数自动生成。 |
| `get-current-model` | 查看当前构建中的模型状态。 |
| `build-model` | 构建模型（生成 EcoModelSpec）。 |
| `run-model` | 构建并运行模型（含可行性校验，切到模拟模式）。 |

### 构建行为约束
- **只构建用户点名的物种**，禁止擅自添加额外物种（除非学生明确同意）。
- 培养液/营养液等**有限资源**不作为独立自增长物种添加，用竞争关系表达。

---

## 📐 模型核心方程

通用微分方程由 `src/eco/derivatives.ts` 按 `EcoModelSpec` 动态生成：

| 关系 | 微分项 | 说明 |
|------|--------|------|
| 自增长（logistic） | `+ r·N·(1 - N/K)` | 生产者/自增长物种 |
| 自然死亡 | `- d·N` | 物种自身死亡率 |
| 捕食（prey→predator） | `prey: -a·P·H`；`predator: + e·a·P·H` | 捕食率 a、转化效率 e |
| 顶级捕食者死亡 | `- m·H` | 顶级捕食者额外死亡率 |
| 竞争 | `- α·N1·N2` | 相互抑制 |
| 互利（饱和） | `+ β·N1·N2/(1 + h·N1·N2)` | Holling Type II 饱和，防发散 |

模拟采用 **欧拉法** 数值积分（步长 `dt = 0.045`），数据窗口保留最近 900 个时间点。

---

## 📂 文件结构

```
.
├── index.html                    # Vite 入口（Chart.js / marked / DOMPurify CDN）
├── package.json / vite.config.ts / tsconfig*.json
├── wrangler.jsonc                # Cloudflare Workers 配置
├── .dev.vars.example             # 环境变量示例
├── src/
│   ├── main.tsx / App.tsx        # 应用入口 + 模式切换
│   ├── eco/                      # 生态模拟核心（纯 TS，框架无关）
│   │   ├── types.ts              # SpeciesDef / RelationDef / EcoModelSpec
│   │   ├── derivatives.ts        # 按 spec 动态生成 dN/dt（委托 computeStep）
│   │   ├── computeStep.ts        # 共享单步积分（derivatives 与 feasibility 共用）
│   │   ├── models/               # 内置模型 spec（lotkaVolterra3）
│   │   ├── useEcoSimulation.ts   # 模拟状态机 hook
│   │   ├── useEcoChart.ts        # Chart.js hook（动态 dataset + 双 Y 轴）
│   │   ├── useEcoBuilder.ts      # 构建器状态管理
│   │   └── constants.ts
│   ├── tools/
│   │   ├── builderTools.ts       # 构建工具执行器（buildModel / add-species 等）
│   │   ├── feasibility.ts        # 数值可行性校验（两阶段修复 loop）
│   │   └── ecoTools.ts           # 模拟工具执行器
│   ├── components/               # UI（ChartPanel / BuilderPanel / EcoTuner / AI 抽屉等）
│   └── styles.css
├── worker/
│   ├── index.ts                  # routeAgentRequest + 静态资源 fallback + CORS/安全头
│   ├── EcoChatAgent.ts           # AIChatAgent + 12 工具 schema + token 限额
│   └── env.d.ts
├── scripts/verify-feasibility.ts # 数值可行性回归测试
└── data/raw/                     # 生态数据预取缓存
```

---

## 🧪 测试

```bash
npm run typecheck            # TypeScript 类型检查
npm test                     # vitest 单元测试（computeStep / feasibility / builderTools）
npm run verify:feasibility   # 数值可行性回归（鲸落/草兔狼/竞争耗竭/互利饱和等）
```

---

## 📋 依赖

- [Chart.js](https://www.chartjs.org/) v4 – 动态折线图（CDN）
- [marked](https://marked.js.org/) + [DOMPurify](https://github.com/cure53/DOMPurify) – AI 回复 markdown 渲染与净化（CDN）
- [React](https://react.dev/) 19 + [Vite](https://vitejs.dev/) 6 – 前端框架与构建
- [Cloudflare Agents SDK](https://developers.cloudflare.com/agents/)（`agents` / `@cloudflare/ai-chat` / `ai` / `@ai-sdk/openai-compatible`）– AI Agent 与 OpenAI 兼容接入
- [zod](https://zod.dev/) – 工具输入 schema 校验

---

项目基于普通高中教科书《生物学 选择性必修2 生物与环境》"种群数量波动"相关内容设计。

**Enjoy exploring ecology!** 🌿🐇🐆
