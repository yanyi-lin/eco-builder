// ========================= /api/chat 处理器（迁移自 worker/EcoChatAgent.onChatMessage） =========================
// 无状态：前端每次把全量 messages 发来，本函数判定模式 → 选系统提示 → streamText → 返回
// UIMessageStream（与 CF 版 toUIMessageStreamResponse 输出格式一致，前端 useChat 直接消费）。
// 关键迁移点（MIGRATION-PLAN §4）：
// - convertToModelMessages 必须开 ignoreIncompleteToolCalls（防中止残留 part 触发 MissingToolResultsError）
// - stopWhen 原样照搬（构建 hasToolCall("run-model") + stepCountIs(60)；模拟 stepCountIs(20)）
// - abortSignal 接请求取消信号（等价 CF 版 options.abortSignal）

import {
  streamText,
  convertToModelMessages,
  hasToolCall,
  stepCountIs,
  type UIMessage,
} from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { detectBuildMode, stripModePrefix } from "./mode.js";
import { buildTools } from "./tools.js";
import { SYSTEM_PROMPT_BUILD, SYSTEM_PROMPT_SIMULATE } from "./prompts.js";

/** 服务端环境变量（来自 process.env，部署时由 .env / ecosystem env 注入） */
export interface ChatEnv {
  OPENAI_BASE_URL: string;
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
}

/** 从 process.env 读取配置；缺失即抛错（启动时 fail-fast，见 index.ts） */
export function loadChatEnv(): ChatEnv {
  const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL ?? "";
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
  const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "";
  if (!OPENAI_BASE_URL || !OPENAI_API_KEY || !OPENAI_MODEL) {
    throw new Error(
      "缺少环境变量：需要 OPENAI_BASE_URL / OPENAI_API_KEY / OPENAI_MODEL（参考 .env.example）",
    );
  }
  return { OPENAI_BASE_URL, OPENAI_API_KEY, OPENAI_MODEL };
}

/**
 * 处理一次聊天请求（对应原 onChatMessage）。
 * @param messages 前端传来的全量 UIMessage[]（含历史与 tool part）
 * @param signal 客户端中止信号（useChat stop() → fetch abort）
 * @returns UIMessageStream 响应（web 标准 Response）
 */
export async function handleChatRequest(
  messages: UIMessage[],
  signal?: AbortSignal,
): Promise<Response> {
  const env = loadChatEnv();

  // 模式判定 + 剥离传输前缀（与 CF 版一致：每请求独立判定，纯函数复用）
  const isBuildMode = detectBuildMode(messages);
  const cleanMessages = stripModePrefix(messages);

  const systemPrompt = isBuildMode ? SYSTEM_PROMPT_BUILD : SYSTEM_PROMPT_SIMULATE;

  // openai-compatible provider：默认走 Chat Completions API（/chat/completions），
  // 兼容 DeepSeek / 官方 OpenAI / 第三方网关 / Ollama（Node 端同样可用）
  const provider = createOpenAICompatible({
    name: "openai",
    baseURL: env.OPENAI_BASE_URL,
    apiKey: env.OPENAI_API_KEY,
  });

  const result = streamText({
    model: provider(env.OPENAI_MODEL),
    system: systemPrompt,
    // ignoreIncompleteToolCalls: 过滤 input-streaming/input-available 的残缺 tool part
    //（用户中途 stop() 时会留下），否则转成 tool-call 无 tool-result → MissingToolResultsError
    messages: await convertToModelMessages(cleanMessages, { ignoreIncompleteToolCalls: true }),
    tools: buildTools(),
    // 停止条件（与 CF 版一致）：构建模式 run-model 后即停，兜底步数上限
    stopWhen: isBuildMode
      ? [hasToolCall("run-model"), stepCountIs(60)]
      : stepCountIs(20),
    abortSignal: signal,
  });

  return result.toUIMessageStreamResponse();
}
