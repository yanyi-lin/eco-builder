# eco-builder：智能体协助的生态模型构建器

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![CI](https://github.com/yanyi-lin/eco-builder/actions/workflows/ci.yml/badge.svg)](https://github.com/yanyi-lin/eco-builder/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=nodedotjs&logoColor=white)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)](tsconfig.json)

[English](README.en.md) | 中文

**智能体协助**的交互式生态学模拟工具：通过**自然语言**即可构建、模拟与分析任意生态模型。支持中/英双语界面。

- **智能体协助**
- 基于 **Lotka-Volterra 数学模型**
- GBIF & GIoBI **数据驱动**

## 目录

- [特性](#特性)
- [部署](#部署)
- [环境变量](#环境变量)
- [智能体助手与工具](#智能体助手与工具)
- [模型核心方程](#模型核心方程)
- [文件结构](#文件结构)
- [测试](#测试)
- [依赖](#依赖)

---

## 特性

### 模拟模式
- **动态种群密度图表**：基于Chart.js，动态显示种群密度变化
- **双 Y 轴图表**：用于清晰显示生态系统中密度悬殊的种群（如鲸落系统中的盲鳗和化能合成细菌）。
- **交互控制**：开始 / 暂停 / 重置模拟。
- **生态扰动实验**：一键减少任意种群 10% / 30% / 50%，观察系统恢复力。


### 构建模式（智能体引导）
- **自然语言构建**：说"构建森林生态系统"或"构建大小草履虫竞争培养液"，智能体自动查数据、加组分、定关系、跑模拟。
- **多关系支持**：捕食（predation）、竞争（competition）、互利（mutualism）。
- **数据驱动**：GBIF 查物种拉丁名、GloBI 查物种间交互关系。
- **可行性自动校验**：构建后自动执行"检测 → 修改 → 再检测"循环，程序能自动辨识参数性灭绝（智能体抽风设错参数）和结构性必然灭绝（生态学上必然崩溃的系统）：
  - **参数性灭绝**（如捕食过强）→ 自动调参修复（`adjusted`）
  - **结构性必然灭绝**（如鲸落：无生产者）→ 智能体指出但允许运行，观察一个必然崩溃的系统一步步衰退和观察生态稳态同样有学习价值。
  - **生态金字塔约束**：捕食者数量不应超过猎物，自动修正
- **竞争/资源耗竭建模**：支持 Gause 竞争排斥实验（有限培养液耗尽 → 双方归零）。
- **组分数量不限**（软护栏 20 个），构建大型食物网。

### 双语支持
- 右上角语言切换（中文 / EN），全站界面（含图表轴、弹窗、按钮）即时切换并记忆。
- AI 回复语言自动跟随用户输入（无法判断时使用界面语言）；工具输出由智能体转述。

---

## 部署

项目由两部分组成：**前端**（Vite 构建的静态资源）与 **Node.js 后端**（agentic助手`/api/chat` + 静态服务），后端内置静态资源服务，因此生产环境**一个进程**即可运行完整应用。同一套代码支持 4 种部署方式（Hono 双运行时架构）。

### 方式一：本地开发（WSL / 任意 Linux）

```bash
npm install
cp .env.example .env        # 填入 OPENAI_API_KEY
npm run dev:server          # 终端 1：后端 http://localhost:3000
npm run dev                 # 终端 2：前端 http://localhost:5173（/api 自动代理到 3000）
```

### 方式二：宝塔面板部署（推荐，面向非开发者）

> 前置要求：宝塔面板 **11.0+**，软件商店安装 **Node.js 版本管理器**（2.7+）。

1. **装 Node**：软件商店 → Node.js 版本管理器 → 安装 **Node 20 或 22 LTS** → 点「设置命令行版本」选择它（版本列表不全先点「更新版本列表」）。
2. **上传代码**：把项目上传到网站目录（默认 `/www/wwwroot/eco-builder`），或使用宝塔的 Git 拉取功能。
3. **构建**：在项目目录执行 `npm install && npm run build`（或在面板终端执行）。
4. **添加 Node 项目**：网站 → Node 项目 → 添加：项目目录选项目根，启动方式选 **自定义 ecosystem.config.cjs**，端口 **3000**，运行用户 **www**，Node 版本选刚装的 20/22。
   - **注意**：`ecosystem.config.cjs` 里的 `name` 必须与**面板中的项目名称完全一致**，否则面板显示"未启动"。
   - **注意**：环境变量（`OPENAI_API_KEY` 等）写在 `ecosystem.config.cjs` 的 `env` 段（或面板"环境变量"栏）；**不要用 `env_production`**（宝塔执行 pm2 时不注入）。
5. **反向代理**：网站 → 添加站点（填域名）→ 设置 → 反向代理 → 目标 URL 填 `http://127.0.0.1:3000`。
6. **防火墙**：安全组/防火墙只需放行 **80/443**（3000 保持内网，勿暴露）。
7. **开机自启**（重要）：宝塔 → 计划任务 → Shell 脚本 → 执行周期选「开机时」，内容：
   `/bin/bash /www/server/nodejs/vhost/scripts/{项目名}.sh &`（部署完成后**实测一次服务器重启**确认自动恢复）。
8. **HTTPS**（可选）：网站 → SSL → 申请 Let's Encrypt 证书，一键开启。

### 方式三：Docker（备选，需要 SSH 操作）

```bash
# 构建镜像（Dockerfile 见仓库根目录）
docker build -t eco-builder .
# 运行（替换环境变量）
docker run -d --name eco-builder -p 3000:3000 \
  -e OPENAI_API_KEY=sk-xxx -e OPENAI_BASE_URL=https://api.deepseek.com \
  -e OPENAI_MODEL=deepseek-v4-flash eco-builder
# 再用宝塔/nginx 反代 127.0.0.1:3000（或宝塔 9.3.0+ 的"容器反向代理"）
```

### 方式四：Cloudflare Workers（同一套代码，自定义域名）

> 架构：共享 Hono app（`server/app.ts`）双运行时——Node 入口跑宝塔/Docker，Worker 入口（`worker/index.ts`）跑 CF Workers。静态资源由 CF 原生 Static Assets 服务，Worker 只处理 `/api/*`。

```bash
npm install
npm run build                    # 产出 dist/（assets）与 dist-server/
cp .dev.vars.example .dev.vars   # 本地开发填 OPENAI_API_KEY（已 gitignore）
npx wrangler dev                 # 本地冒烟 http://localhost:8787

# 生产部署
npx wrangler secret put OPENAI_API_KEY   # 或面板 Settings → Variables and Secrets
npx wrangler deploy                       # 绑定自定义域名后在 CF 面板配置路由
```

- 环境变量：`OPENAI_BASE_URL` / `OPENAI_MODEL` / `BUILD_MAX_STEPS` 在 `wrangler.jsonc` 的 `vars`（明文）；`OPENAI_API_KEY` 必须用 **Secret**（加密，`secrets.required` 会在 deploy 时强校验）。
- **步数上限**：CF 免费档单请求 50 子请求，`BUILD_MAX_STEPS` 默认 60（宝塔不受限）；CF 部署在 `wrangler.jsonc` vars 已设 **40**，避免撞墙。宝塔端不设置即用默认 60。
- **限流说明**：三层防线，全部进程内存计数。① 请求 body ≤ 256KB、messages ≤ 40 条、单条 ≤ 8000 字符（超限 400/413）；② per-IP 滑动窗口 60 次/小时 + 并发 ≤ 4（超限 429 带 `Retry-After`；额度按工具 auto-continuation 每轮一计——一次完整构建会话约 10-15 轮，60 次 ≈ 4-5 次完整构建，校园机房 NAT 共享出口 IP 也已留余量）；③ 全局每日 20k 请求上限（兜底）。客户端 IP 取 `CF-Connecting-IP` / `X-Real-IP` / `X-Forwarded-For` 首跳 / Node socket 直连，前两层头须由前置代理覆写（宝塔 nginx / CF 均满足）。CF Workers 多 isolate 环境下均为 **per-isolate 近似值**（非全局精确），教学场景可接受；需要精确全局计数需引入 Durable Object（需要CF依赖，git历史版本中有，有需要的可以自己去翻）。

### 大模型选择

- 推荐使用deepseek-v4-flash（开发时根据deepseek-v4-flash优化的系统提示词）
- 建议使用中文支持较好的LLM
- 不建议使用kimi-k3、deepseek-v4-pro、qwen-3.8max、glm-5.3等超强模型（出token速度慢、容易自己加戏）
- 不建议使用stepfun-3.7-flash等超快LLM（有卡顿风险，相关优化not planned）



---

## 环境变量

| 变量                   | 说明                                               | 示例                         |
| -------------------- | ------------------------------------------------ | -------------------------- |
| `OPENAI_BASE_URL`    | OpenAI 兼容 API base URL（`/chat/completions` 自动拼接） | `https://api.deepseek.com` |
| `OPENAI_MODEL`       | 模型名                                              | `deepseek-v4-flash`        |
| `OPENAI_API_KEY`     | API Key（secret，不提交仓库）                            | `sk-...`                   |
| `PORT`               | Node 服务监听端口（默认 3000；CF 部署无需）                     | `3000`                     |
| `BUILD_MAX_STEPS`    | 构建模式单轮步数上限（默认 60；CF 建议 40）                       | `40`                       |
| `SIMULATE_MAX_STEPS` | 模拟模式单轮步数上限（默认 20）                                | `20`                       |
| `MAX_OUTPUT_TOKENS`  | 单次响应输出 token 上限（默认 4096；成本护栏）                    | `4096`                     |

- 本地开发：复制 `.env.example` 为 `.env` 填写（`.env` 已被 gitignore）。
- 宝塔部署：写在 `ecosystem.config.cjs` 的 `env` 段（或面板"环境变量"栏）。
- CF 部署：vars（明文）+ secrets（`OPENAI_API_KEY`），本地用 `.dev.vars`。
- 兼容任意 OpenAI Chat Completions 兼容端点（DeepSeek / 官方 OpenAI / 第三方网关 / Ollama），由 `@ai-sdk/openai-compatible` 驱动。

---

## 智能体助手与工具

智能体助手基于 **Vercel AI SDK**（`ai` + `@ai-sdk/react`）实现：Node 服务端（`server/`）声明工具 schema 并调用 OpenAI 兼容 API 流式生成，工具的实际执行在浏览器 `onToolCall` 中直接操作模拟器/构建器状态，`sendAutomaticallyWhen` 自动续轮（工具执行完成后自动继续下一轮 LLM 调用）。

### 模拟模式工具

| 工具                            | 作用                            |
| ----------------------------- | ----------------------------- |
| `read-animal-data`            | 读取物种列表、各物种数量、关系与运行状态。         |
| `animal-population-set`       | 设置物种数量（部分更新）。**调用前必须先 read。** |
| `start` / `pause` / `restart` | 启动 / 暂停 / 重置模拟。               |

### 构建模式工具

| 工具                   | 作用                                                    |
| -------------------- | ----------------------------------------------------- |
| `search-species`     | 从 GBIF 搜索物种分类信息（拉丁名、置信度）。                             |
| `query-interactions` | 从 GloBI 查询两物种间交互（仅返回涉及两物种的记录）。                        |
| `add-species`        | 添加物种（id / 名称 / 初始数量 / hasLogistic / 增长率 / 容纳量 / 死亡率）。 |
| `add-relation`       | 添加关系（捕食 / 竞争 / 互利），系数自动生成。                            |
| `get-current-model`  | 查看当前构建中的模型状态。                                         |
| `build-model`        | 构建模型（生成 EcoModelSpec）。                                |
| `run-model`          | 构建并运行模型（含可行性校验，切到模拟模式）。                               |

### 构建行为约束
- **只构建用户点名的物种**，禁止擅自添加额外物种（除非用户明确同意）。
- 培养液/营养液等**有限资源**不作为独立自增长物种添加，用竞争关系表达。

---

## 模型核心方程

通用微分方程由 `src/eco/derivatives.ts` 按 `EcoModelSpec` 动态生成：

| 关系                | 微分项                                  | 说明                     |
| ----------------- | ------------------------------------ | ---------------------- |
| 自增长（logistic）     | `+ r·N·(1 - N/K)`                    | 生产者/自增长物种              |
| 自然死亡              | `- d·N`                              | 物种自身死亡率                |
| 捕食（prey→predator） | `prey: -a·P·H`；`predator: + e·a·P·H` | 捕食率 a、转化效率 e           |
| 顶级捕食者死亡           | `- m·H`                              | 顶级捕食者额外死亡率             |
| 竞争                | `- α·N1·N2`                          | 相互抑制                   |
| 互利（饱和）            | `+ β·N1·N2/(1 + h·N1·N2)`            | Holling Type II 饱和，防发散 |

模拟采用 **欧拉法** 数值积分（步长 `dt = 0.045`），数据窗口保留最近 900 个时间点。

---

## 文件结构

```
.
├── index.html                    # Vite 入口（本地 vendor 资源）
├── package.json / vite.config.ts / tsconfig*.json
├── wrangler.jsonc                # Cloudflare Workers 配置
├── .env.example / .dev.vars.example  # 环境变量示例
├── src/
│   ├── main.tsx / App.tsx        # 应用入口 + 模式切换
│   ├── i18n/                     # 双语支持（LanguageProvider / 文案表）
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
│   ├── components/               # UI（ChartPanel / BuilderPanel / EcoTuner / 智能体抽屉等）
│   └── styles.css
├── server/                       # 共享后端（Hono，Node + CF Workers 双运行时）
│   ├── app.ts                    # 共享 Hono app（/api/chat + 安全头 + 限流，运行时无关）
│   ├── chat.ts                   # streamText 聊天处理器（env 注入式 + 步数配置化）
│   ├── prompts.ts                # 模拟/构建模式系统提示词
│   ├── tools.ts                  # 12 个智能体工具 schema（执行在浏览器端）
│   ├── mode.ts                   # [MODE: build] 前缀判定与剥离（纯函数）
│   ├── rateLimit.ts              # 每日请求限额（内存版）
│   └── index.ts                  # Node 入口（dotenv + 静态 + SPA fallback + serve）
├── worker/
│   └── index.ts                  # CF Workers 入口（export default fetch，零 node 内置模块）
├── ecosystem.config.cjs          # 宝塔面板 PM2 部署配置
├── wrangler.jsonc                # Cloudflare Workers 部署配置（assets + vars + secrets）
├── scripts/verify-feasibility.ts # 数值可行性回归测试
└── data/raw/                     # 生态数据预取缓存
```

---

## 测试

```bash
npm run typecheck            # TypeScript 类型检查（前端 + server + worker）
npm test                     # vitest 单元/集成测试（104 项：生态核心/工具/协议/双语/前端链路）
npm run verify:feasibility   # 数值可行性回归（鲸落/草兔狼/竞争耗竭/互利饱和等）
```

---

## 依赖

- [Chart.js](https://www.chartjs.org/) v4 – 动态折线图（本地 vendor）
- [marked](https://marked.js.org/) + [DOMPurify](https://github.com/cure53/DOMPurify) – AI 回复 markdown 渲染与净化（本地 vendor）
- [React](https://react.dev/) 19 + [Vite](https://vitejs.dev/) 6 – 前端框架与构建
- [Vercel AI SDK](https://ai-sdk.dev/)（`ai` / `@ai-sdk/react` / `@ai-sdk/openai-compatible`）– AI 聊天（Node 服务端流式生成 + 客户端工具执行）
- [Hono](https://hono.dev/) 4 – 跨运行时 Web 框架（Node + CF Workers 双部署共用同一 app）
- [@hono/node-server](https://www.npmjs.com/package/@hono/node-server) – Node 端 Hono 适配（宝塔/pm2）
- [zod](https://zod.dev/) – 工具输入 schema 校验

---
