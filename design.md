# eco-agent 设计文档

> 本文档记录 eco-builder（Agent 引导式生态模拟构建）的设计决策，供后续开发与协作参考。

## 1. 目标

让学生通过自然语言与 Agent 对话，快速构建可运行的生态模拟模型（Lotka-Volterra 类）。
流程：**识别组分 → 获取数据 → 界定关系 → 设置参数 → 构建并运行**。

## 2. 核心原则

- **Agent 主导，快速构建**：不教学引导，直接帮学生建模型（教学解释由后续"教学 skills"功能承担）。
- **数据驱动**：Agent 优先通过工具从数据源获取物种分类与交互关系。
- **自主决策**：Agent 根据数据完备性自行决定下一步——能推断就推断，数据缺失才向学生提问。
- **组分数量限制**：≤ 10 个，建议 ≤ 5 个，超出则引导学生精简。
- **中文输出，英文 System Prompt**：LLM 逻辑更稳定。

## 3. Agent 工作流

### 3.1 整体流程

```
学生输入自然语言描述（如"模拟草原上的草、兔、狐"）
        │
        ▼
Step 1  组分识别：提取物种候选（≤5 个）
        │
        ▼
Step 2  数据获取：工具查询 GBIF（分类）/ GloBI（交互）
        │
        ▼
Step 3  缺失判断：数据不足 → 向学生提问补全；数据完备 → 继续
        │
        ▼
Step 4  参数设置：基于分类学经验值 + 学生定性输入
        │
        ▼
Step 5  构建模型：生成 EcoModelSpec 并注册
        │
        ▼
Step 6  运行模拟：切换到模拟模式
```

### 3.2 工具设计（5 个）

| 工具 | 作用 | 数据源 | 执行位置 |
|------|------|--------|----------|
| `search-species` | 搜索物种分类信息 | GBIF species/match API | 前端（浏览器 fetch） |
| `query-interactions` | 查询两物种间交互关系 | GloBI API | 前端（浏览器 fetch） |
| `build-model` | 根据物种+关系+参数生成 spec 并注册 | 本地 | 前端 |
| `run-model` | 切换到模拟模式并运行 | 本地 | 前端 |
| `get-current-model` | 读取当前构建状态 | 本地 | 前端 |

> 说明：builder 工具沿用现有架构模式——Worker 声明 schema，前端 onToolCall 执行。
> 数据源 API（GBIF/GloBI）因 CORS 与可达性问题，可能需经 Worker 代理，见第 5 节。

### 3.3 自主决策逻辑

Agent 不应机械按步骤执行，而应：

1. **尝试获取**：先调用工具查询数据。
2. **判断完备性**：
   - 物种 EXACT 匹配且置信度 ≥ 90 → 静默接受；
   - 多候选/低置信度 → 提问让用户选择；
   - 无匹配 → 请求用户替换物种。
3. **关系推断**：GloBI 返回交互则确认关系类型；否则问学生。
4. **参数估计**：按分类学给默认值；学生给出定性描述（"繁殖快/慢"）时调整。
5. **数据完备即构建**：不重复提问，构建后立即运行。

## 4. 缺失场景与提问策略

| 缺失类型 | Agent 行为 | 提问示例 |
|----------|-----------|----------|
| 物种找不到 | 请求替换 | "找不到'独角兽'，能换个物种吗？" |
| 物种歧义 | 给选项 | "草指什么？1.禾本科 2.三叶草 3.其他" |
| 关系未知 | 问关系类型 | "草和兔之间是什么关系？捕食/竞争/互利/无关" |
| 参数无数据 | 问定性估计 | "兔的繁殖速度你估计快还是慢？" |
| 组分过多 | 请求精简 | "超过 5 个了，保留哪 5 个？" |

## 5. 数据源策略

### 5.1 可达性结论（中国大陆无代理实测，2026-08）

| 数据源 | 状态 | 说明 |
|--------|------|------|
| GBIF API (api.gbif.org) | ✅ 可达（约 1.8s） | 物种匹配、出现记录 |
| GloBI API (api.globalbioticinteractions.org) | ✅ 可达（约 1.2s） | 交互网络 |
| NESDC / CERN | ✅ 首页可达 | API 待探索 |
| CoLChina / Geodata / ScienceDB / BioONE | ❌ 不可达 | 连接超时 |

> 注：实测环境为 WARP 代理至美国，结果可能与真实大陆网络略有差异；
> 但 GBIF/GloBI 相对稳定，作为默认数据源风险较低。

### 5.2 本地数据缓存

已预取部分数据至 `data/raw/`（GBIF 物种匹配 + GloBI 交互，共 19 个文件），
供 Agent 离线兜底或快速演示。数据文件清单见 `data/REACHABILITY.md`。

### 5.3 三级回退（后续可选）

1. 优先本地缓存（`data/raw/`）
2. 其次实时查询 GBIF / GloBI
3. 最后向学生提问补全

## 6. System Prompt（英文，写入 EcoChatAgent）

```
You are an ecosystem model builder. Build models efficiently from natural language.

## Tools
- search-species: Query GBIF for species taxonomy. Returns match confidence and classification.
- query-interactions: Query GloBI for species interactions. Returns interaction type.
- build-model: Create EcoModelSpec from species, relations, and parameters.
- run-model: Switch to simulation mode and start.
- get-current-model: Read current build state.

## Workflow
1. Parse user description, extract species candidates (max 5).
2. For each species, call search-species.
   - EXACT match with confidence >= 90: accept silently.
   - Multiple candidates or low confidence: ask user to choose.
   - No match: ask user for alternative.
3. For each species pair, call query-interactions.
   - If found: determine type (predation/competition/mutualism).
   - If not found: ask user to specify relationship.
4. Parameters: use ecological defaults based on taxonomy. Adjust if user gives qualitative hints.
5. Call build-model, then run-model.

## Rules
- No species cap (soft guard at 20 to prevent runaway). User may add as many as they want.
- Do NOT teach or explain ecology. Just build.
- Build immediately when data is complete. Only ask when data is genuinely missing.
- Respond in Chinese, keep responses short.
```

## 7. 关系类型扩展（Phase 1 已完成）

- `RelationType` 扩展为 `"predation" | "competition" | "mutualism"`
- `derivatives.ts` 新增分支：
  - **competition**：`dN1 -= α1·N1·N2`，`dN2 -= α2·N1·N2`
  - **mutualism**：`dN1 += β1·N1·N2`，`dN2 += β2·N1·N2`
- `RelationDef` / `RelationSnapshot` 接口已同步更新
- 现有 `lotkaVolterra3` 模型不受影响（类型检查通过）

## 8. 部署方案（GitHub + Cloudflare）

### 8.1 结构

- 代码托管：`github.com/yanyi-lin/eco-agent`
- 运行：Cloudflare Workers（Workers Builds 自动部署）
- LLM：DeepSeek 官方 API（OpenAI 兼容）
- 访问地址：`https://eco-agent.yanyi-lin.workers.dev`

### 8.2 环境变量

| 变量 | 值 |
|------|-----|
| `OPENAI_BASE_URL` | `https://api.deepseek.com` |
| `OPENAI_MODEL` | `deepseek-v4-flash` |
| `OPENAI_API_KEY` | DeepSeek API Key（secret，不入库） |

### 8.3 Token 使用限制

为控制成本，实施了每日 token 使用限制：

- **限制额度**：每日 500 万 tokens（约 5 元人民币）
- **定价参考**（DeepSeek V4 Flash）：
  - 输入：0.5 元 / 百万 tokens
  - 输出：2 元 / 百万 tokens
- **实现方式**：
  - 在 Durable Object 的 SQLite 中创建 `token_usage` 表
  - 每次 API 调用后，从响应的 `usage` 字段提取 `inputTokens` 和 `outputTokens`
  - 按日期累加到表中
  - 请求前检查当日累计是否超限
  - 超限时返回 429 错误，提示用户明日再试
- **限制范围**：按 Durable Object 实例（每个用户会话独立）
- **如需全局限制**：需改用 KV 存储

### 8.4 Cloudflare 操作

```bash
npx wrangler login          # 浏览器授权
npx wrangler secret put OPENAI_API_KEY   # 输入 DeepSeek key
npx wrangler deploy         # 部署
```

或 Cloudflare Dashboard → Workers → 连接 GitHub repo（Workers Builds）自动部署。

## 9. 模型可行性校验与灭绝分类（已实现）

### 9.1 流程

构建模型后（buildModel 内部），`ensureFeasible` 自动执行**检测→修改→再检测循环，直到修好**：

1. **检测**：快速模拟 4000 步（≈180 时间单位，覆盖 10+ 振荡周期），检测是否有物种触底（≤ minValue）
2. **分类**（第一性原理，沿食物链追索能量来源）：
   - **结构性必然灭绝**（`structural-extinction`）：灭绝物种及其捕食链**无任何可再生能量来源**（无 logistic 生产者）——如鲸落（一次性资源）、无生产者的纯捕食链，或自动调参至边界仍无法避免。**不运行模型**，返回诊断
   - **参数性可修复**（`adjusted`）：有能量来源但参数极端（捕食率过高/消费者种群爆炸/基底再生不足/初始值过低）——进入修复 loop
3. **修复 loop**（确定性收敛式，两阶段）：
   - **阶段 1 消除灭绝**（最多 12 轮）：把参数推向已知稳定域——
     - 捕食率压向下限（×0.4 → 0.002）
     - 消费者（中间营养级）增长率/容纳量压低（避免爆炸压死基底）
     - 纯生产者增长率提高（上限 0.8，与 UI 一致）
     - 顶级捕食者自然死亡率提高（predatorDeathRate → 0.2）
     - 灭绝物种初始值提升（避免前期振荡触底）
   - **阶段 2 生态金字塔修复**（最多 6 轮）：灭绝消除后，检查营养级数量金字塔——
     - 若捕食者稳定数量 ≥ 猎物数量（如"狼 239 ≥ 兔 92"），逐步提高捕食者死亡率（+25%/轮，上限 0.5）
     - 若金字塔修复导致灭绝，回退该次修改并接受现状（不误报结构性）
   - 每轮重新检测；修好 → `adjusted`；确认无法修复 → `structural-extinction`
4. **结果状态**（写入 `EcoModelSpec.feasibility`，LLM 可读）：
   - `ok`：首轮即稳定，无需处理
   - `adjusted`：系统已自动修好，LLM 向学生简述修复内容
   - `structural-extinction`：无法通过参数修复（生态学必然如鲸落/食物链过长），**模型不运行**，run-model 返回 error，LLM 向学生解释原因并询问是否调整模型结构

### 9.2 决策记录

- 结构性灭绝模型**不运行**（run-model 拦截，防止"瞎改后运行注定灭绝的模型"），让学生与 LLM 讨论后决定是否调整结构（如添加生产者）
- 参数性灭绝**自动修复**（检测→修改→再检测 loop，修好即停），学生无感，LLM 简述
- 修复边界与 UI 滑块一致（增长率 ≤0.8、K ≤500、初始 ≤300），保证修好的参数 UI 可调节
- 修复只动与灭绝相关的参数（压低消费者/捕食率、增强基底），避免"增强灭绝物种却引爆其天敌"的连锁灭绝（旧增量策略的缺陷）
- **生态金字塔约束**（用户实测反馈：狼 239 ≫ 兔 92 系统仍"稳定"但生态不合理）：稳定后捕食者数量必须 < 猎物数量（数量金字塔），否则自动提高捕食者死亡率（阶段 2）

### 9.3 开放式构建适配（硬编码排查，subagent 对抗审查）

结论：**模拟/微分方程/图表/AI 工具链对任意 N 物种/任意关系通用**（derivatives.ts 按 spec 动态生成；图表按 spec.species map），自定义模型与内置 lotkaVolterra3 共享同一套代码。已修复的隐性"草兔狼"假设：

- **轴分配**：左轴不再固定给"第一个添加的物种"，改为第一个 hasLogistic 物种（生产者基底），避免先加顶级捕食者时其占左轴（`builderTools.ts` buildModel）
- **轴范围**：改用可行性修复后的参数计算（修复前会导致曲线顶到轴上沿）
- **可行性预检**：simulate 加入 competition/mutualism 项，与 derivatives.ts 一致（原仅捕食关系）
- **内置模型死键**：lotkaVolterra3 的 P0/H0/L0 改为 Plant0/Hare0/Lynx0（与 `<Id>0` 约定一致，修复 Eco-Tuner 初始滑块无效）
- **UI 文案动态化**：App 标题用 spec.name；CustomLegend 轴说明按实际左右轴物种生成；AI 空态示例文案通用化

未修（改进项，非 bug）：图表双轴压缩（>4 物种同右轴时小物种难读）、InfoModal 为项目级"关于"说明不随模型变。

### 9.4 安全与健壮性审计（2026-08-10，3 subagent 对抗审查）

已修复：
- **互利关系数值发散**（🔴）：β·N1·N2 双线性无饱和 → 改饱和形式 β·N1·N2/(1+h·N1·N2)，h=1/(K1·K2)。derivatives 与 feasibility 同步。实测 β=0.05 从爆炸改为稳定 ~1244
- **CORS 反射 Origin**（🔴）：改为域名白名单（workers.dev + localhost:5173），非白名单来源无 CORS 头
- **安全响应头**（🔴）：X-Content-Type-Options/X-Frame-Options/Referrer-Policy/Permissions-Policy 应用于所有响应
- **无 Error Boundary**（🔴）：新增顶层 ErrorBoundary，捕获渲染异常防白屏
- **物种上限不一致**（🟡#22）：prompt Max 5 vs 工具上限 10 → 统一为 5（后应使用者要求移除数量限制，改为软护栏 20）

审查确认的已有防护：API key 无硬编码、DOMPurify 净化 AI 输出、NaN/Infinity 防御、关系去重、GloBI 过滤防扩种。
记录未修项（见 AUDIT-REPORT.md）：CDN 脚本无 SRI、无速率限制、Euler 步长、per-DO token 限制、npm 依赖漏洞等（低风险或属基础设施范畴）。

### 9.5 竞争场景建模修正（2026-08-11，用户实测）

用户实测"构建大小草履虫"：agent 擅自加入"营养液"组分并设 hasLogistic=true，导致：
- 营养液自增长（有限培养液变成可再生资源，涨到 K 压死草履虫）
- 大小草履虫曲线完全重合（对称竞争）

修复：
1. **classifyExtinction 忽略 competition 关系**（bug）：只沿捕食链找能量来源，competition 对手有自增长时误判"无生产者"→ structural。已修复：competition/mutualism 关系中对手物种有 hasLogistic 也算再生来源
2. **adjusted 但有 extinctSpecies 时不再静默运行**：模型结构有问题（如自增长组分压制消费者），run-model 拦截并返回诊断，让 LLM 与学生讨论调整结构
3. **prompt 强化**：明确"培养液/营养液/资源"是有限资源，不作为独立自增长物种添加；Gause 实验用两个物种 hasLogistic=false 的竞争关系表达

验证：15 项全过（新增场景12：营养液竞争 → 非 structural）。纯竞争正确模型仍判 ok 正常运行。

### 9.6 复杂模型不再打地鼠扩种（2026-08-11，用户实测森林生态）

用户实测"构建森林生态系统"：agent 反复添加田鼠/灌木等组分试图满足可行性校验，最终报错。

根因：run-model 对 `adjusted + 有 extinctSpecies` 硬拦截返回 error，LLM 收到后按
prompt 引导"调整模型结构"，于是打地鼠式加物种——但复杂生态模型中部分物种被
竞争排斥是真实生态现象（Gause 竞争排斥原理），强行"修到所有物种存活"既困难
也无教育意义。

修复：
1. **去掉 run-model 对 adjusted+extinctSpecies 的硬拦截**：模型运行，extinctSpecies
   透传给 LLM，由 LLM 判断是竞争排斥（合理现象，解释给学生观察）还是建模错误
   （如营养液自增长），并建议调整——不再诱导加物种
2. **prompt 更新**：adjusted+有灭绝时，向学生说明哪些物种难以维持及原因，
   除非学生明确要求否则不添加新物种/关系来"修复"

验证：typecheck ✅ / vitest 12 ✅ / verify 15 ✅
- 森林模型（5 物种 6 关系）：run-model 正常运行（adjusted+extinct 透传）
- 营养液错误建模：正常运行 + 诊断透传，LLM 解释而非打地鼠

### 9.7 允许观察崩溃系统 + 修复 predatorDeathRate 写回缺失（2026-08-11）

用户 issue（GitHub #1）：构建鲸落系统时"模拟曲线表格没有加载出来"。

设计决策（用户确认）：**允许学生建立并观察不稳定系统（鲸落/生态瓶）如何慢慢崩溃**——
结构性必然灭绝的模型**仍然运行**（不再拦截），让曲线展示各物种先后灭绝的崩溃过程，
这正是教学价值所在。LLM 明确标注"此系统必然灭绝，观察崩溃过程"。

顺带修复一个真实 bug：addRelationParams 生成顶级捕食者 <pred>_m 参数时
**未写回 relation.predatorDeathRate**，导致 computeStep 的死亡项被跳过
（`if(rel.predatorDeathRate)` 为 false）→ 顶级捕食者在食物耗尽后不饿死
（鲸落中睡鲨涨到 25848）。修复后睡鲨正确饿死，崩溃链完整。

验证：17 项全过（新增场景13：predatorDeathRate 写回 + 睡鲨饿死）。

### 9.8 对称竞争护栏（2026-08-12）

用户反馈：agent 容易加入对称竞争（coeff1 == coeff2），现实中几乎不存在且无
教学价值（两条曲线完全重合，无法区分竞争结果）。

双层护栏：
1. **建模层（护栏1）**：system prompt 明确"除非用户明确要求，不要建立对称竞争"；
   addRelationParams 默认竞争系数**不对称**（0.012 / 0.005，一方约 2.4 倍强），
   仅当 LLM 显式传入相同值时才保留对称（用户有意演示理想化场景）。
2. **检测层（护栏2）**：新增 detectCurveOverlap——对每个 competition 关系对
   模拟 4000 步后检查稳定期（后 1/4）两条曲线是否几乎重合（相对差 < 5%），
   或都贴地且几乎相等（同步崩溃）。检测结果透传给 LLM（feasibility.curveOverlap），
   由 LLM 判断并主动提出"使竞争系数不对称"后再运行。

验证：20 项全过（新增场景14：默认不对称 + 对称检测到糊在一起 + 不对称不误检）。

### 9.9 曲线重合度检测 v2：证据 + 完全重回硬标记 + 崩溃豁免（2026-08-12）

用户方向：检测层**不做 feature/bug 判断**——只返回定量重合度证据；重合度高是
feature（类对称反相振荡/错峰灭绝等合法现象）还是 bug（无意义对称竞争）由 agent
泛化能力结合用户上下文判断。检测层只对**无歧义的"完全重回"**做硬标记。

数学度量（经 12 场景实验验证，/tmp/opencode/overlap_math_test.ts）：
- 三层层级判断，每层豁免一类场景：
  1. 全程共同存活比例 < 0.3 → 崩溃/错峰/灭绝（如鲸落）→ 豁免
  2. 稳定期平均种群 ≤ 3×minValue → 贴地/接近灭绝（鲸落收尾）→ 豁免
  3. 稳定期贴合比例 ≤ 0.9 → 类对称反相振荡/有区分度 → 豁免
  4. 三层全过 → coincident=true（健康共存 + 稳定期曲线几乎全程瞬时重合）
- 关键：**只统计"两者都健康存活"的步**（> 2×minValue），贴地不算存活，
  避免"双双归零"被误判为曲线重合（鲸落收尾豁免）。
- 返回证据字段：coincident / fullBothAliveFrac / stableCloseFrac / maxRelDiff /
  stableMean / reason（豁免原因，供 agent 理解）。

prompt 同步重写：coincident=true → 明确无教学价值，主动提议不对称化；
coincident=false 但豁免类 → 合法生态现象（崩溃/反相），不需修改；
agent 只在能明确判断"参数雷同"时才提议修改。

验证：23 项全过（场景14 改造 + 场景15：捕食关系不检测 / Gause 对称崩溃豁免 /
共存完全重回判糊）。12 个数学实验场景行为全部符合预期。

### 9.10 中间营养级消费者灭绝修复 + 初始值覆盖 bug（2026-08-12）

用户 bug：森林系统（树+鹿+狼），两种树正常增长，但鹿和狼数量持续下降趋近0，
报错"鹿 在数值上仍难以维持"；补充：数量下降时狼在完全归零前比鹿多。

根因（两处）：
1. **applyFixes 盲区**：灭绝的中间营养级消费者（鹿，既是捕食者又无 logistic）
   灭绝时，修复逻辑只降"它被吃的捕食率"（狼吃鹿），从不提高"它吃猎物的
   捕食率"（鹿吃树）→ 鹿能量摄入不足，靠微弱捕食率勉强存活但长期低迷，
   甚至 12 轮耗尽报"难以维持"。兜底分支还会把所有捕食率压到下限，
   进一步抵消能量来源。
2. **inferDefaultParams 覆盖用户 initial**：无 logistic 物种初始值强制写 30
   （logistic 写 150），无视 LLM 传入的 initial（鹿=100 被改成 30），
   且 buildModel 的兜底因已写入而永不触发。

修复：
- applyFixes 新增分支：灭绝消费者（predator）灭绝时提高其吃猎物的捕食率
  （每轮 ×1.5，上限 0.02），增加能量获取。
- 兜底压低捕食率时跳过灭绝消费者的能量来源（避免抵消）。
- inferDefaultParams 优先使用 sp.initial（LLM 传入值），仅在未提供时用默认。

验证：25 项全过（新增场景16：提高鹿吃树率 + 鹿存活）。
用户场景复现：鹿100狼30 → 修复前 deer=36.8 wolf=32.5（鹿低迷），
修复后 deer=73.5 wolf=65.2（鹿>狼，金字塔合理）。

### 9.11 模拟模式 build 护栏（软约束，issue #3）（2026-08-13）

用户 bug（contributor issue #3）：agent 在【模拟模式】下向用户承诺能 build，
但尝试后发现自己不在 build 模式、无权限——前端 executeTool 对 build 工具
返回"未知工具"错误。

根因：worker 端 `tools` 对象对两种模式**暴露全部工具**（模拟+build），只有
systemPrompt 按模式切换（软约束），LLM 在模拟模式仍能看到 build 工具 schema
并误以为可用。且模式切换完全由用户手动（App.tsx 按钮），agent 无感知。

修复（方案 B，软护栏）：在 SYSTEM_PROMPT_SIMULATE 显式声明模式限制——
"只能操作已有模型，不能构建；若用户想构建，明确告诉用户点击左上角
『构建新模型』按钮切换到【构建模式】"。工具仍全暴露（依赖 LLM 自觉），
后续可升级为方案 A（tools 按模式过滤，从根上杜绝）。

### 9.12 全局每日请求限制（计数器 DO，2026-08-13）

用户需求：每天 20k 次请求上限（非 token），每日重置，耗尽返回 429"明日再试"。

背景：原 token 限制（DAILY_TOKEN_LIMIT=5M）存在架构缺陷——token_usage 表存
在**每个 DO 实例私有 SQLite**，按 DO 实例隔离计数，刷新/新建会话即新实例、
配额随之重置（对抗式审查 #3 确认）。多会话方案会放大此问题。

设计（方案 A，用户确认）：
- 计数单位从 token 改为**请求次数**（每 onChatMessage +1，含工具 auto-continuation
  每轮，更严格、防自动续环耗尽）
- 新增固定 name 的计数器 DO（TokenCounter），所有会话实例通过
  `env.ECO_COUNTER.get(idFromName("global")).increment(date)` RPC 原子计数
  （DO 单线程保证原子性，无并发丢计数；按 date 主键，新的一天自然新行）
- 继承 cloudflare:workers 的 DurableObject 基类获得 DurableObjectBranded，
  env.d.ts 用 `DurableObjectNamespace<TokenCounter>` 泛型使 RPC 类型安全
- 每日 20k 上限，超限返回 429 + "请明日再试"

改动：wrangler.jsonc（+ECO_COUNTER 绑定 + migration v2）、env.d.ts（+泛型绑定）、
新增 worker/TokenCounter.ts、index.ts 导出、EcoChatAgent 删 token_usage 逻辑
改用计数器（删 ensureTokenTable/getTodayUsage/recordUsage 3 方法 + onFinish 记账）。

验证：typecheck ✅ / vitest 12 ✅ / SQL 语义验证（20000 次 allowed、20001 次 429、
跨日期重置）✅ / wrangler dev 绑定确认 ✅
部署 Version 5b2ae9e4

## 10. 待办 / 下一步

- [x] Phase 2a：builder 工具实现（search-species / query-interactions / build-model / run-model / get-current-model）
- [x] Phase 2b：EcoChatAgent System Prompt 更新（builder 模式）
- [x] Phase 2c：UI 模式切换（模拟模式 ↔ 构建模式）
- [x] 模型可行性校验与灭绝分类（9 节）
- [ ] 数据源 API 经 Worker 代理（解决 CORS + 统一回退逻辑）
- [ ] 教学 skills（后续功能）
- [ ] **尚未构建的可选功能**：BuilderPanel / 页面上展示"模型可行性"状态提示（目前诊断仅通过 LLM 对话转述；若需要可视化状态徽章/弹窗，需新增 UI 组件）
