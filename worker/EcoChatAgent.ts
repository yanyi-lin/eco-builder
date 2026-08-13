import { AIChatAgent } from "@cloudflare/ai-chat";
import {
  streamText,
  convertToModelMessages,
  tool,
  stepCountIs,
  hasToolCall,
  type ToolSet,
} from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";
import type { Env } from "./env.d";

// 全局限额：每日请求次数上限（每个 onChatMessage 含工具 auto-continuation 每轮 +1）
const DAILY_REQUEST_LIMIT = 20_000;

/**
 * 生态模拟器 AI 聊天 Agent。
 *
 * 工具在 Worker 端声明 schema，前端 onToolCall 根据模式执行：
 * - 模拟模式：read-animal-data, animal-population-set, start, pause, restart
 * - 构建模式：search-species, query-interactions, add-species, add-relation, get-current-model, build-model, run-model
 */
const SYSTEM_PROMPT_SIMULATE = `你是生态模拟器的 AI 助手。用中文回答，简洁明了。

当前处于【模拟模式】，可以控制已有模型的种群数量、启停模拟。

⚠️ 模式限制（重要）：
- 你**只能**操作已有模型（读数量/改数量/启停/重置），**不能**构建新模型
- 如果用户想构建新生态模型（如"构建森林/鲸落系统"），**不要尝试自己构建**，
  而是明确告诉用户："构建新模型需要在左上角点击『构建新模型』按钮，切换到【构建模式】"
- 用户切到构建模式后，你才能使用 add-species/add-relation/run-model 等构建工具

可用工具：
- read-animal-data：读取当前物种列表、数量、关系与运行状态
- animal-population-set：设置物种数量（部分更新）
- start：启动或继续模拟
- pause：暂停模拟
- restart：重置模拟到初始状态

操作后简述结果。`;

const SYSTEM_PROMPT_BUILD = `你是生态模拟器的 AI 助手。用中文回答，简洁明了。

当前处于【构建模式】，需要帮用户构建新的生态模型。

## 物种范围（最重要，严格遵守）
- **只构建用户明确要求/提到的物种，禁止添加用户未提到的任何物种**
- 物种数量不限（最多 20 个）。用户要求加更多组分就加，模型会自适应
- 除非学生明确同意，不得通过 add-species 添加额外物种（如补充生产者、被捕食者、天敌）
- query-interactions 返回结果中出现的其他物种仅作参考信息，**不得**据此添加新物种

## 构建工作流（必须按顺序完成）
1. 对每个物种调用 search-species 获取拉丁名（注意：GBIF 不支持中文名，需要用户提供拉丁名或你推断）
2. 对每个物种调用 add-species 添加到模型（hasLogistic=true 表示该物种有环境容纳量限制；若该物种是植物/资源类，通常应传 hasLogistic=true）
3. 对需要关系的物种对调用 query-interactions 查询交互
4. 根据查询结果调用 add-relation 添加关系（捕食/竞争/互利）
5. 最后调用 run-model 构建并运行；**run-model 成功后立即总结并停止，不要再添加物种**

## 示例：用户说"模拟草、兔、狐"
→ search-species("Poaceae") → search-species("Lepus") → search-species("Vulpes")
→ add-species(id=grass, name=草, hasLogistic=true) → add-species(id=rabbit, name=兔, deathRate=0.2) → add-species(id=fox, name=狐, deathRate=0.1)
→ query-interactions("Poaceae", "Lepus") → query-interactions("Lepus", "Vulpes")
→ add-relation(type=predation, prey=grass, predator=rabbit) → add-relation(type=predation, prey=rabbit, predator=fox)
→ run-model()
用户说"模拟草、兔、狐"就只构建这 3 个物种，不要扩展到其他物种。

## 参数约定（重要）
- add-species 的 growthRate/carryingCapacity/deathRate 传**数值**（如 growthRate=0.3），不传键名，代码自动处理
- add-relation 只需传 type/prey/predator（或 species1/species2），捕食率等系数代码自动生成，无需传

## 竞争/互利场景建模（重要）
- **竞争（competition）**：两个物种争夺同一有限资源。
  - 若用户描述"资源有限/耗尽、胜者最终也死亡"（如 Gause 大小草履虫竞争培养液）→ 两个物种都传 **hasLogistic=false**（无自增长，靠竞争系数消耗，最终耗竭归零）
  - **不要**把"培养液/营养液/资源"添加为独立物种——那是有限资源，不是生物组分。只需用两个物种的竞争关系表达即可
  - 若用户描述"竞争但各自能维持"（如森林中两种树竞争光照）→ 传 hasLogistic=true（各自有承载上限，竞争只是互相抑制）
- **互利（mutualism）**：两物种相互促进，通常传 hasLogistic=true
- 竞争/互利关系只需传 species1/species2，竞争系数自动生成

## 对称竞争护栏（重要）
- **除非用户明确要求（如教学演示对称竞争的理想化场景），不要建立"对称竞争"**
- 对称竞争 = 两个物种的竞争系数相同（coeff1 == coeff2）。现实中几乎不存在
  势均力敌的对称竞争（总有一方对资源的竞争能力更强），且对称竞争下两条
  曲线会完全重合/纠缠在一起，无法区分竞争结果，没有教学价值
- 现实中的竞争总是不对称的：一方略强（竞争系数一方明显大于另一方）
- 如果用户描述的是"两种物种争夺同一资源"（如 Gause 大小草履虫），应让
  竞争系数**不对称**（一方明显大于另一方），体现真实的竞争强弱差异

## 模型可行性诊断（run-model 返回 feasibility 字段时）
系统会自动执行"检测→修改→再检测"循环修复参数性灭绝。所有模型**都会运行**（允许学生观察崩溃过程，如鲸落/生态瓶）。
- feasibility.status = "adjusted" **且无 extinctSpecies**：系统自动调整了参数（降低捕食率/调整增长率/容纳量/死亡率等）以消除灭绝，模型可运行。向学生简述系统自动修复了什么
- feasibility.status = "adjusted" **但有 extinctSpecies**：模型已运行，但系统指出某些物种（extinctSpecies）在数值上难以维持。这是**真实的生态学现象**，不要慌，也不要因此添加新物种：
  1. 判断原因：这是**竞争排斥**（多物种争资源，弱者被挤出——Gause 竞争排斥原理）还是**建模不合理**（如把培养液/营养液建成自增长资源）？
  2. 向学生如实说明哪些物种难以维持、为什么（竞争/捕食/资源不足）
  3. 这是有教育价值的观察点：竞争排斥本来就是生态学要学习的现象。询问学生是否希望调整（如降低竞争强度、调整参数），或接受现状观察竞争结果
  4. **除非学生明确要求，不要添加新物种或新关系来"修复"**——增加组分往往让系统更难平衡
- feasibility.status = "structural-extinction"：系统结构上必然灭绝（如鲸落：无生产者、一次性资源，或生态瓶：封闭系统），已尝试自动调参但仍无法避免。**模型仍然运行**——让学生观察这个不稳定系统如何慢慢崩溃，这是极有价值的教学场景。正确做法：
  1. 向学生解释灭绝原因（缺少可再生的能量来源，或食物链过长）
  2. 说明"观察崩溃过程"正是教学目的——曲线会显示各物种先后灭绝的先后顺序
  3. 询问学生是否希望调整模型（如加入生产者/化能合成细菌改造为可持续系统），或保留观察崩溃
  4. **不得擅自添加新物种**，必须等学生明确同意
- feasibility.status = "ok"：无需说明
- feasibility.curveOverlap 非空：系统对每对竞争物种返回了曲线重合度证据
  （coincident / fullBothAliveFrac / stableCloseFrac / maxRelDiff / stableMean / reason）。
  检测层**不做 feature/bug 判断**，重合度高是"有意义的生态现象"还是"无意义的对称竞争",
  由你结合用户上下文（原始描述、物种、关系）判断。分情况处理：
  1. coincident=true（reason="健康共存且完全重回"）：两条曲线在稳定期几乎全程重合，
     完全无法区分——通常是对称竞争或参数雷同。这是最明确的无教学价值情形：
     向学生说明"完全对称的竞争在现实中几乎不存在，曲线会重合无区分度"，
     **主动提出修改**（竞争系数不对称，一方明显大于另一方），修改后重新运行。
     除非学生明确要求保留对称场景，否则应修改。
  2. coincident=false 但 stableCloseFrac 高（reason 为豁免类）：
     - 若豁免原因是"崩溃/错峰"或"接近灭绝/贴地"（如鲸落收尾）：这是合法的
       崩溃/竞争排斥过程，曲线本来就有教学价值（观察灭绝先后顺序），
       **不需要修改**，向学生如实说明即可
     - 若豁免原因是"稳定期未完全重合"：两条曲线有区分度（如反相振荡/类对称——
       一条波峰时另一条波谷），这是合法生态现象，**不需要修改**，向学生说明
     - 只有当你能判断是"参数雷同"导致的无意义贴近时，才提议修改
  3. **关键原则**：检测层返回的是证据不是结论。除非你能明确说出
     "这两物种被建模成完全对称的竞争"（coincident=true 或参数确实相同），
     否则不要轻易提议修改——反相振荡、错峰灭绝都是值得观察的生态现象。

如果 GBIF 返回 matchType=NONE，告诉用户需要提供拉丁学名。

操作后简述结果。`;

export class EcoChatAgent extends AIChatAgent<Env> {
  // 通过固定 name 的计数器 DO 做全局每日请求计数。
  // 注意：DO 实例的 SQLite 是实例私有的，无法跨会话共享限额，
  // 故统一走 env.ECO_COUNTER 的全局实例（idFromName("global") 确定性映射）。
  private async checkAndIncrementRequest(date: string): Promise<{ count: number; allowed: boolean }> {
    const counter = this.env.ECO_COUNTER.get(this.env.ECO_COUNTER.idFromName("global"));
    const { count } = await counter.increment(date);
    return { count, allowed: count <= DAILY_REQUEST_LIMIT };
  }

  async onChatMessage(
    onFinish: Parameters<AIChatAgent<Env>["onChatMessage"]>[0],
    options?: Parameters<AIChatAgent<Env>["onChatMessage"]>[1],
  ) {
    // 全局每日请求次数限制（跨所有会话实例聚合）
    const today = new Date().toISOString().split('T')[0];
    const { allowed } = await this.checkAndIncrementRequest(today);
    if (!allowed) {
      const msg = `今日请求次数已达上限（${DAILY_REQUEST_LIMIT.toLocaleString()}），剩余 0。请明日再试。`;
      return new Response(JSON.stringify({ error: msg }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 检测当前模式：从最后一条用户消息中查找 [MODE: build] 标记
    const lastMessage = this.messages[this.messages.length - 1];
    let isBuildMode = false;
    
    if (lastMessage?.role === "user" && Array.isArray(lastMessage.parts)) {
      for (const part of lastMessage.parts) {
        if (part.type === "text" && typeof part.text === "string" && part.text.includes("[MODE: build]")) {
          isBuildMode = true;
          break;
        }
      }
    }
    
    const systemPrompt = isBuildMode ? SYSTEM_PROMPT_BUILD : SYSTEM_PROMPT_SIMULATE;

    // 用 openai-compatible provider：默认走 Chat Completions API（/chat/completions），
    // 兼容官方 OpenAI 及任意 OpenAI 兼容端点（第三方网关 / Ollama / 自建代理等），
    // 不会触发 @ai-sdk/openai 默认的 Responses API（/responses，多数兼容端点 404）。
    const provider = createOpenAICompatible({
      name: "openai",
      baseURL: this.env.OPENAI_BASE_URL,
      apiKey: this.env.OPENAI_API_KEY,
    });

    const tools: ToolSet = {
      // === 模拟模式工具 ===
      "read-animal-data": tool({
        description:
          "读取当前模拟器的物种列表、各物种数量、关系与运行状态。调用 animal-population-set 前必须先调用本工具。",
        inputSchema: z.object({}),
      }),
      "animal-population-set": tool({
        description:
          "设置物种数量（仅种群，不含模型参数）。部分更新：可以传入物种 id 和对应数量。未提供的物种保持不变。低于该物种最小阈值会自动 clamp。",
        inputSchema: z.object({}).passthrough(),
      }),
      "start": tool({
        description: "启动或继续模拟。",
        inputSchema: z.object({}),
      }),
      "pause": tool({
        description: "暂停模拟。",
        inputSchema: z.object({}),
      }),
      "restart": tool({
        description: "重置模拟到初始状态。",
        inputSchema: z.object({}),
      }),
      
      // === 构建模式工具 ===
      "search-species": tool({
        description: "从 GBIF 搜索物种分类信息。返回物种的拉丁名、分类、匹配置信度等。",
        inputSchema: z.object({
          query: z.string().describe("物种名称（中文或拉丁名）"),
        }),
      }),
      "query-interactions": tool({
        description: "从 GloBI 查询两个物种间的交互关系。返回交互类型（捕食/竞争/互利等）。",
        inputSchema: z.object({
          species1: z.string().describe("物种1的拉丁名"),
          species2: z.string().describe("物种2的拉丁名"),
        }),
      }),
      "add-species": tool({
        description: "添加一个物种到构建中的模型。growthRate/carryingCapacity/deathRate 传数值，代码自动处理参数键。仅添加用户明确提到的物种，禁止擅自添加额外物种。",
        inputSchema: z.object({
          id: z.string().describe("物种 id（英文，如 'rabbit'）"),
          name: z.string().describe("显示名（如 '草兔'）"),
          color: z.string().optional().describe("曲线颜色（可选，如 '#4caf50'）"),
          initial: z.number().optional().describe("初始种群数量"),
          hasLogistic: z.boolean().optional().describe("是否有环境容纳量限制（植物/资源物种为 true）"),
          growthRate: z.number().optional().describe("增长率 r（数值，如 0.3）"),
          carryingCapacity: z.number().optional().describe("环境容纳量 K（数值，如 200）"),
          deathRate: z.number().optional().describe("自然死亡率（数值，如 0.15）"),
        }),
      }),
      "add-relation": tool({
        description: "添加一个关系到构建中的模型。只需传 type 和物种，捕食率等系数自动生成。",
        inputSchema: z.object({
          type: z.enum(["predation", "competition", "mutualism"]).describe("关系类型"),
          prey: z.string().optional().describe("被捕食者 id（predation 时必填）"),
          predator: z.string().optional().describe("捕食者 id（predation 时必填）"),
          species1: z.string().optional().describe("物种1 id（competition/mutualism 时必填）"),
          species2: z.string().optional().describe("物种2 id"),
        }),
      }),
      "get-current-model": tool({
        description: "获取当前构建中的模型状态（物种、关系、参数）。",
        inputSchema: z.object({}),
      }),
      "build-model": tool({
        description: "构建模型（生成 EcoModelSpec）。",
        inputSchema: z.object({
          name: z.string().optional().describe("模型名称"),
          description: z.string().optional().describe("模型描述"),
        }),
      }),
      "run-model": tool({
        description: "构建并运行模型（切换到模拟模式）。",
        inputSchema: z.object({
          name: z.string().optional().describe("模型名称"),
          description: z.string().optional().describe("模型描述"),
        }),
      }),
    };

    const result = streamText({
      // openai-compatible provider 直接调用即走 Chat Completions（/chat/completions）
      model: provider(this.env.OPENAI_MODEL),
      system: systemPrompt,
      messages: await convertToModelMessages(this.messages),
      tools,
      // 停止条件：
      // 1. 构建模式：调用 run-model 后立即停止（正常结束，无未完成工具调用）
      // 2. 兜底步数上限：防止 LLM 无限调用工具（模拟 20 / 构建 60）。
      //    之前用 stepCountIs(20) 在复杂构建（森林 5 物种 6 关系）中容易触顶，
      //    且触顶若停在工具调用进行中会导致 MissingToolResultsError → 前端"出错"。
      stopWhen: isBuildMode
        ? [
            hasToolCall("run-model"),
            stepCountIs(60),
          ]
        : stepCountIs(20),
      abortSignal: options?.abortSignal,
      onFinish: async (event) => {
        // 全局每日请求计数已在 onChatMessage 开头统一递增（含工具续回合），
        // 此处无需再记录 token/请求量。
        onFinish(event);
      },
    });

    return result.toUIMessageStreamResponse();
  }
}
