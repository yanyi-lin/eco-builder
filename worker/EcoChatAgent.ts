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
 * 5 个工具均在服务端声明 schema 但不提供 execute —— 由前端 onToolCall 执行，
 * 操作浏览器里的实时模拟状态（P/H/L、暂停、重置等）。
 * autoContinueAfterToolResult=true 自动续轮。
 */
const SYSTEM_PROMPT = `你是生态模拟器的 AI 助手。用中文回答，简洁明了。

你可以通过工具控制模拟器。操作后简述结果。`;

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
      "read-animal-data": tool({
        description:
          "读取当前模拟器的物种列表、各物种数量、关系与运行状态。调用 animal-population-set 前必须先调用本工具。",
        inputSchema: z.object({}),
        // 无 execute —— 前端 onToolCall 执行
      }),
      "animal-population-set": tool({
        description:
          "设置物种数量（仅种群，不含模型参数）。部分更新：可以传入植物(plant)、雪兔(hare)或猞猁(lynx)的数量。未提供的物种保持不变。低于该物种最小阈值会自动 clamp。",
        inputSchema: z.object({
          plant: z.number().optional().describe("植物种群的目标数量（可选，不传保持不变）"),
          hare: z.number().optional().describe("雪兔种群的目标数量（可选，不传保持不变）"),
          lynx: z.number().optional().describe("猞猁种群的目标数量（可选，不传保持不变）"),
        }),
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
