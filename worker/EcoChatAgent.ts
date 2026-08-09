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
const SYSTEM_PROMPT = `你是生态模拟器的 AI 助手。用中文回答，简洁明了。

你可以通过工具控制模拟器。操作后简述结果。

当前有两种模式：
- 模拟模式：控制已有模型的种群数量、启停模拟
- 构建模式：帮用户构建新的生态模型（搜索物种、定义关系、设置参数）

根据用户意图选择工具。`;

export class EcoChatAgent extends AIChatAgent<Env> {
  async onStart() {
    // 初始化 token 使用量追踪表
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
    const today = new Date().toISOString().split('T')[0];
    const result = await this.ctx.storage.sql.exec(
      `SELECT total_tokens FROM token_usage WHERE date = ?`,
      [today]
    );
    const row = result.one();
    return (row?.total_tokens as number) || 0;
  }

  private async recordUsage(promptTokens: number, completionTokens: number) {
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
        description: "添加一个物种到构建中的模型。",
        inputSchema: z.object({
          id: z.string().describe("物种 id（英文，如 'rabbit'）"),
          name: z.string().describe("显示名（如 '草兔'）"),
          color: z.string().optional().describe("曲线颜色（如 '#4caf50'）"),
          initial: z.number().optional().describe("初始种群数量"),
          hasLogistic: z.boolean().optional().describe("是否有 logistic 自限增长"),
          growthRate: z.string().optional().describe("增长率参数键（hasLogistic=true 时）"),
          carryingCapacity: z.string().optional().describe("容纳量参数键（hasLogistic=true 时）"),
          deathRate: z.string().optional().describe("死亡率参数键"),
        }),
      }),
      "add-relation": tool({
        description: "添加一个关系到构建中的模型。",
        inputSchema: z.object({
          type: z.enum(["predation", "competition", "mutualism"]).describe("关系类型"),
          prey: z.string().optional().describe("被捕食者 id（predation 时必填）"),
          predator: z.string().optional().describe("捕食者 id（predation 时必填）"),
          predationRate: z.string().optional().describe("捕食率参数键"),
          conversionEfficiency: z.string().optional().describe("转化效率参数键"),
          predatorDeathRate: z.string().optional().describe("捕食者死亡率参数键"),
          species1: z.string().optional().describe("物种1 id（competition/mutualism 时必填）"),
          species2: z.string().optional().describe("物种2 id"),
          coeff1: z.string().optional().describe("物种1受影响系数"),
          coeff2: z.string().optional().describe("物种2受影响系数"),
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
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(this.messages),
      tools,
      stopWhen: stepCountIs(8),
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
