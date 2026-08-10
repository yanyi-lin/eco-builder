# eco-agent 三维度对抗式审查报告

> 审查时间：2026-08-10
> 审查方式：3 个独立 subagent 对抗式审查（代码质量 / 安全部署 / 业务逻辑）

---

## 总览

| 维度 | 评分 | 🔴严重 | 🟡中等 | 🟢轻微 |
|------|:----:|:------:|:------:|:------:|
| 代码质量与架构 | **6/10** | 7 | 9 | 7 |
| 安全与部署 | **7/10** | 2 | 8 | 5 |
| 业务逻辑与数值 | **7.5/10** | 1 | 4 | 10 |

---

## 🔴 必须修复（跨审查共识 + 高严重度）

### 1. 互利关系无上限约束 — 数值发散风险
**`src/eco/derivatives.ts`** — 互利项 `dN += β·N1·N2` 是纯双线性增长，无饱和项。当 β 较大时正反馈可压倒 logistic 阻尼，导致数值爆炸。可行性检测仅模拟 4000 步，慢速发散会逃过检测。
> 建议：加入 Holling Type II 饱和形式 `βN1N2/(1+hN1N2)` 或绝对上限 clamp

### 2. CORS 反射 Origin + Credentials — 等效完全开放
**`worker/index.ts:13-20`** — 将请求 Origin 原样反射到 `Access-Control-Allow-Origin`，同时设 `credentials: true`。任何网站可发起跨域请求并携带凭证。
> 建议：改为域名白名单

### 3. 无 Error Boundary — 任何组件异常白屏
**`src/App.tsx`** — 整个应用无 React Error Boundary，Chart.js 渲染异常或 AI 消息解析错误直接白屏崩溃。
> 建议：顶层添加 ErrorBoundary + 重新加载按钮

### 4. 缺失安全响应头
**`worker/index.ts`** — 无 `X-Content-Type-Options`、`X-Frame-Options`、`CSP`、`HSTS`。
> 建议：在非 OPTIONS 响应中添加安全头

---

## 🟡 建议修复（按影响排序）

### 架构与可维护性

| # | 问题 | 位置 |
|---|------|------|
| 5 | **derivatives.ts 与 feasibility.ts 方程重复**（~40行），修改必须同步两处，维护风险高 | 代码质量 + 业务逻辑审查共识 |
| 6 | **零测试覆盖** — 核心纯函数（derivatives、ensureFeasible、buildModel）无测试保障 | 代码质量 |
| 7 | **build-model + run-model 重复调用 buildModel()**，可行性检测（4000步×最多18轮）执行两次 | 业务逻辑 |
| 8 | **`setSimulationRunning` 当 getter 用**（setter 反模式），每次步进触发不必要的 reconciliation | 代码质量 |
| 9 | **`useEcoChart` 返回函数未 useCallback**，下游 ChartPanel effect 每次渲染重触发 | 代码质量 |
| 10 | **`addRelationParams` 隐式修改传入的 relation 对象**（隐藏副作用，极难调试） | 代码质量 |

### 安全

| # | 问题 | 位置 |
|---|------|------|
| 11 | **CDN 脚本无 SRI** — chart.js/marked/dompurify 三个外部脚本无 integrity 校验，CDN 被攻破可注入恶意代码 | `index.html:7-13` |
| 12 | **Token 限制 per-DO 独立** — 用户可创建多会话绕过 500 万额度 | `worker/EcoChatAgent.ts` |
| 13 | **无请求速率限制** — 可高频发送消息消耗 LLM token | `worker/index.ts` |
| 14 | **8 个 npm 已知漏洞**（5 moderate, 3 high）：fast-uri(主机名混淆)、nanoid(无限循环)、postcss(文件读取)、@hono/node-server(路径遍历) | `package-lock.json` |
| 15 | **`VITE_DIRECT_OPENAI`** 若未来填入 API Key 会暴露到浏览器 bundle | `vite.config.ts:11-13` |
| 16 | **错误消息暴露精确限额数字**（5,000,000），攻击者可据此计算预算 | `worker/EcoChatAgent.ts:112-114` |
| 17 | **DOMPurify 加载失败降级** — 当前返回纯文本（安全），但未来代码变更可能意外移除检查 | `MessageList.tsx:27` |
| 18 | **`observability.enabled: true`** 可能记录请求体中的用户消息/工具参数 | `wrangler.jsonc:23-25` |

### 业务逻辑

| # | 问题 | 位置 |
|---|------|------|
| 19 | **Euler 法步长 0.045**，刚性系统（捕食率极高/种群差异悬殊）可能数值振荡或能量虚假增长 | `derivatives.ts` + `feasibility.ts` |
| 20 | **classifyExtinction 对纯竞争/互利系统判定不准确** — 只沿捕食链追索能量来源，无捕食关系的物种被判为"结构性灭绝" | `feasibility.ts:113-117` |
| 21 | **`add-relation` 不阻止自捕食**（prey === predator），数学上不崩溃但语义荒谬 | `builderTools.ts:340-345` |
| 22 | **agent prompt 限制 5 物种但工具允许 10**，存在不一致 | `builderTools.ts:323` vs system prompt |
| 23 | **阶段1耗尽后 adjusted=true 但仍有灭绝**，run-model 不拦截，用户看到"部分灭绝"模型无警告 | `feasibility.ts:128-133` |

### 前端体验与性能

| # | 问题 | 位置 |
|---|------|------|
| 24 | **MessageList useMemo 依赖 msg 对象引用**，ai 库每次状态变化产生新 messages 数组，memo 无效 | `MessageList.tsx:62-70` |
| 25 | **BuilderPanel 关系列表用 index 作 key**，删除/重排时 React 错误复用 DOM | `BuilderPanel.tsx:68` |
| 26 | **arr.shift() 在热路径上 O(n)**，每 38ms 执行，应改用 slice 或环形缓冲 | `useEcoSimulation.ts:89-91` |
| 27 | **模态框缺 Escape 关闭和焦点陷阱**，不符合无障碍最佳实践 | `EcoTunerModal.tsx` / `InfoModal.tsx` |
| 28 | **history 和 timeData 分离为两个 state**，总是一起更新却触发两次 setState | `useEcoSimulation.ts:68-72` |
| 29 | **executeBuilderTool 大量 `as string` 类型断言**，完全信任 LLM 输出无运行时校验 | `builderTools.ts:230-310` |
| 30 | **spec 切换 effect 只依赖 spec.id**，eslint 规则被 disable | `useEcoSimulation.ts:195-205` |

### 代码组织

| # | 问题 | 位置 |
|---|------|------|
| 31 | **buildModel 函数过长（~150行）**，含关系去重、参数清理、物种兜底、轴分配、可行性校验等多职责 | `builderTools.ts:170-320` |
| 32 | **EcoChatAgent.onChatMessage 过长（~150行）**，工具定义占大部分 | `worker/EcoChatAgent.ts:55-200` |
| 33 | **全局 Window 类型声明放在组件文件中**，应独立为 `.d.ts` | `MessageList.tsx:13-17` |
| 34 | **ensureTokenTable() 每次操作执行 CREATE TABLE**，应用实例级标志避免重复 DDL | `worker/EcoChatAgent.ts:35-43` |
| 35 | **applyDisturbance 与 setPopulation 中"同步历史末位"逻辑重复** | `useEcoSimulation.ts:140-155, 175-185` |

---

## 🟢 轻微 / 已知改进项

| # | 问题 | 位置 |
|---|------|------|
| 36 | 竞争关系参数化语义未在 RelationDef 注释中说明 | `derivatives.ts:57-62` |
| 37 | 阶段2 的 `adjusted` 初始化是死代码（始终为 false） | `feasibility.ts:165-167` |
| 38 | 灭绝检测从第 100 步才开始，早期灭绝被忽略 | `feasibility.ts:56` |
| 39 | K=0 时产生 NaN（`?? 1` 不拦截 0），但 buildModel 保证 K≥50 | `derivatives.ts:33` |
| 40 | SpeciesDef.axis 是必填字段但 buildModel 会覆盖，在自定义模型中无实际作用 | `types.ts:82-87` |
| 41 | 内置模型参数 b=0.016 超出 builder 的 clamp 上限 0.015（内置模型不走 clamp） | `lotkaVolterra3.ts:72-74` |
| 42 | queryInteractions 的 GloBI 过滤用 `includes` 可能子串误匹配 | `builderTools.ts:225-243` |
| 43 | getToolName try-catch 静默降级为 "tool"，开发环境应 console.warn | `MessageList.tsx:80-92` |
| 44 | simApi/builderApi 用 useMemo([]) 创建永不重建对象，语义上应使用 useRef | `useEcoAgent.ts:53-88` |
| 45 | 超过 4 物种共享右轴时小物种难读（已知未修） | `useEcoChart.ts` |

---

## 项目优势（审查确认）

- ✅ **类型系统设计优秀**：`EcoModelSpec` 泛化能力强，新增模型只需添加 spec 文件
- ✅ **防御性编程意识强**：NaN/Infinity 检查、参数 clamp、关系去重、GloBI 结果过滤防扩种
- ✅ **API 密钥安全良好**：无硬编码、无泄露、.gitignore 正确覆盖
- ✅ **XSS 防护到位**：DOMPurify 净化 AI 回复
- ✅ **可行性校验设计精巧**：两阶段策略（结构性 vs 参数性灭绝）有理论深度
- ✅ **代码注释高质量**：解释"为什么"而非"做了什么"
- ✅ **关注点分离良好**：hooks（逻辑）、components（UI）、tools（AI 工具）各司其职
- ✅ **双轴分配逻辑正确**：左轴分配给第一个 hasLogistic 物种，轴范围使用修复后参数

---

## 优先修复建议（Top 5）

| 优先级 | 问题 | 理由 |
|:------:|------|------|
| 1 | 🔴 互利关系加饱和约束 | 业务正确性 — 可能导致数值发散 |
| 2 | 🔴 CORS 白名单化 + 安全响应头 | 基础安全加固 |
| 3 | 🔴 添加 Error Boundary | 用户体验 — 防止白屏崩溃 |
| 4 | 🟡 提取共享 computeStep 消除方程重复 | 可维护性 — 两处同步修改极易遗漏 |
| 5 | 🟡 为核心纯函数添加单元测试 | 长期迭代信心 — derivatives/ensureFeasible/buildModel |
