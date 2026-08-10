import { AIChatAgent } from "@cloudflare/ai-chat";
import {
  streamText,
  convertToModelMessages,
  tool,
  stepCountIs,
  type ToolSet,
} from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";
import type { Env } from "./env.d";

// Token 使用限制（每日 500 万 tokens，约 5 元人民币）
const DAILY_TOKEN_LIMIT = 5_000_000;

/**
 * 生态模拟器 AI 聊天 Agent。
 *
 * 工具在 Worker 端声明 schema，前端 onToolCall 根据模式执行：
 * - 模拟模式：read-animal-data, animal-population-set, start, pause, restart
 * - 构建模式：search-species, query-interactions, add-species, add-relation, get-current-model, build-model, run-model
 */
const SYSTEM_PROMPT_SIMULATE = `你是生态模拟器的 AI 助手。用中文回答，简洁明了。

当前处于【模拟模式】，可以控制已有模型的种群数量、启停模拟。

可用工具：
- read-animal-data：读取当前物种列表、数量、关系与运行状态
- animal-population-set：设置物种数量（部分更新）
- start：启动或继续模拟
- pause：暂停模拟
- restart：重置模拟到初始状态

操作后简述结果。`;

const SYSTEM_PROMPT_BUILD = `你是生态模拟器的 AI 助手。用中文回答，简洁明了。

当前处于【构建模式】，需要帮用户构建新的生态模型。

## 构建工作流（必须按顺序完成）
1. 对每个物种调用 search-species 获取拉丁名（注意：GBIF 不支持中文名，需要用户提供拉丁名或你推断）
2. 对每个物种调用 add-species 添加到模型（hasLogistic=true 表示该物种有环境容纳量限制，通常植物/资源物种需要）
3. 对需要关系的物种对调用 query-interactions 查询交互
4. 根据查询结果调用 add-relation 添加关系（捕食/竞争/互利）
5. 最后调用 run-model 构建并运行

## 示例：用户说"模拟草、兔、狐"
→ search-species("Poaceae") → search-species("Lepus") → search-species("Vulpes")
→ add-species(id=grass, name=草, hasLogistic=true) → add-species(id=rabbit, name=兔, deathRate=0.2) → add-species(id=fox, name=狐, deathRate=0.1)
→ query-interactions("Poaceae", "Lepus") → query-interactions("Lepus", "Vulpes")
→ add-relation(type=predation, prey=grass, predator=rabbit) → add-relation(type=predation, prey=rabbit, predator=fox)
→ run-model()

## 参数约定（重要）
- add-species 的 growthRate/carryingCapacity/deathRate 传**数值**（如 growthRate=0.3），不传键名，代码自动处理
- add-relation 只需传 type/prey/predator（或 species1/species2），捕食率等系数代码自动生成，无需传

## 模型可行性诊断（run-model 返回 feasibility 字段时）
系统会自动执行"检测→修改→再检测"循环，直到把参数性灭绝修好；只有确认无法通过参数修复（结构上必然灭绝）才会返回 structural-extinction。
- feasibility.status = "adjusted"：系统自动调整了参数（降低捕食率/调整增长率/容纳量/死亡率等）以消除灭绝，模型可运行。向学生简述系统自动修复了什么
- feasibility.status = "structural-extinction"：系统结构上必然灭绝（如鲸落：无生产者、一次性资源），已尝试自动调参但仍无法避免，**此时模型不会运行**，你会收到 error 提示。正确做法：
  1. 向学生解释灭绝原因（缺少可再生的能量来源/生产者，或食物链过长）
  2. 询问学生是否要调整模型结构（如添加生产者/可再生资源物种）
  3. 学生同意后，用 add-species/add-relation 修改模型
  4. **再次调用 run-model 重新检测**（检测→修改→再检测循环），直到模型可运行
  5. 不要在没有可再生产者的结构上直接运行模型
- feasibility.status = "ok"：无需说明

如果 GBIF 返回 matchType=NONE，告诉用户需要提供拉丁学名。

操作后简述结果。`;

export class EcoChatAgent extends AIChatAgent<Env> {
  private async ensureTokenTable() {
    // 在第一次使用时创建表（幂等操作）
    await this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS token_usage (
        date TEXT PRIMARY KEY,
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0
      )
    `);
  }

  private async getTodayUsage(): Promise<number> {
    await this.ensureTokenTable();
    const today = new Date().toISOString().split('T')[0];
    const result = await this.ctx.storage.sql.exec(
      `SELECT total_tokens FROM token_usage WHERE date = ?`,
      [today]
    );
    // 使用 toArray() 而非 one()，避免 0 行时抛 RangeError
    const rows = result.toArray();
    return (rows[0]?.total_tokens as number) || 0;
  }

  private async recordUsage(promptTokens: number, completionTokens: number) {
    await this.ensureTokenTable();
    const today = new Date().toISOString().split('T')[0];
    const total = promptTokens + completionTokens;
    
    await this.ctx.storage.sql.exec(`
      INSERT INTO token_usage (date, prompt_tokens, completion_tokens, total_tokens)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        prompt_tokens = prompt_tokens + excluded.prompt_tokens,
        completion_tokens = completion_tokens + excluded.completion_tokens,
        total_tokens = total_tokens + excluded.total_tokens
    `, [today, promptTokens, completionTokens, total]);
  }

  async onChatMessage(
    onFinish: Parameters<AIChatAgent<Env>["onChatMessage"]>[0],
    options?: Parameters<AIChatAgent<Env>["onChatMessage"]>[1],
  ) {
    // 检查 token 使用限制
    const currentUsage = await this.getTodayUsage();
    if (currentUsage >= DAILY_TOKEN_LIMIT) {
      const remaining = DAILY_TOKEN_LIMIT - currentUsage;
      const msg = `今日 token 用量已达上限（${DAILY_TOKEN_LIMIT.toLocaleString()}），剩余 ${Math.max(0, remaining).toLocaleString()}。请明日再试。`;
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
        description: "添加一个物种到构建中的模型。growthRate/carryingCapacity/deathRate 传数值，代码自动处理参数键。",
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
      stopWhen: stepCountIs(20),  // 构建模式需要更多步骤（约 11 步）
      abortSignal: options?.abortSignal,
      onFinish: async (event) => {
        // 记录 token 使用量
        if (event.usage) {
          await this.recordUsage(
            event.usage.inputTokens || 0,
            event.usage.outputTokens || 0
          );
        }
        // 调用原始的 onFinish
        onFinish(event);
      },
    });

    return result.toUIMessageStreamResponse();
  }
}
