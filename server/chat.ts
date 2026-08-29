// ========================= /api/chat 处理器 =========================
// 无状态：前端每次把全量 messages 发来，本函数判定模式 → 选系统提示 → streamText → 返回
// UIMessageStream（与 useChat 协议一致，前端直接消费）。
// 关键点（HONO-MIGRATION-PLAN §3 步骤1）：
// - convertToModelMessages 必须开 ignoreIncompleteToolCalls（防中止残留 part 触发 MissingToolResultsError）
// - stopWhen：构建 hasToolCall("run-model") + 步数上限（BUILD_MAX_STEPS，默认 60）；
//   模拟 stepCountIs(SIMULATE_MAX_STEPS，默认 20)——步数读环境变量，
//   CF 部署 vars 设 BUILD_MAX_STEPS=40 规避 50 子请求墙，宝塔默认 60（配置驱动，不改代码）
// - abortSignal 接请求取消信号（Node: req.signal / Hono: c.req.raw.signal）
// - env 注入式：Node 传 process.env，Worker 传 c.env（业务层零 process 直接依赖）

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
import { SYSTEM_PROMPT_BUILD, SYSTEM_PROMPT_SIMULATE, type ReplyLang } from "./prompts.js";

/** 服务端运行配置（部署时由 .env / ecosystem env / CF vars+secrets 注入） */
export interface ChatEnv {
  OPENAI_BASE_URL: string;
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
  /** 构建模式单轮步数上限（CF 建议 40 < 50 子请求墙；宝塔默认 60） */
  BUILD_MAX_STEPS: number;
  /** 模拟模式单轮步数上限（默认 20） */
  SIMULATE_MAX_STEPS: number;
  /** 单次响应输出 token 上限（防单次回复成本无上界；env: MAX_OUTPUT_TOKENS，默认 4096） */
  MAX_OUTPUT_TOKENS: number;
}

/**
 * 从任意键值来源读取并校验运行配置（Node 传 process.env，Worker 传 c.env）。
 * 必填缺失即抛错（fail-fast，由调用方在请求处理/启动时捕获）；步数非法时回落默认值。
 */
export function loadChatEnv(source: Record<string, unknown> = {}): ChatEnv {
  const str = (key: string): string =>
    typeof source[key] === "string" ? (source[key] as string) : "";
  const OPENAI_BASE_URL = str("OPENAI_BASE_URL");
  const OPENAI_API_KEY = str("OPENAI_API_KEY");
  const OPENAI_MODEL = str("OPENAI_MODEL");
  if (!OPENAI_BASE_URL || !OPENAI_API_KEY || !OPENAI_MODEL) {
    throw new Error(
      "缺少环境变量：需要 OPENAI_BASE_URL / OPENAI_API_KEY / OPENAI_MODEL（参考 .env.example）",
    );
  }
  const parseSteps = (key: string, def: number): number => {
    const v = Number(source[key]);
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : def;
  };
  return {
    OPENAI_BASE_URL,
    OPENAI_API_KEY,
    OPENAI_MODEL,
    BUILD_MAX_STEPS: parseSteps("BUILD_MAX_STEPS", 60),
    SIMULATE_MAX_STEPS: parseSteps("SIMULATE_MAX_STEPS", 20),
    MAX_OUTPUT_TOKENS: parseSteps("MAX_OUTPUT_TOKENS", 4096),
  };
}

/**
 * 处理一次聊天请求。
 * @param messages 前端传来的全量 UIMessage[]（含历史与 tool part）
 * @param signal 客户端中止信号（useChat stop() → fetch abort）
 * @param env 运行配置（loadChatEnv 的结果）
 * @param lang 界面语言（"zh" | "en"，默认 "zh"）；用于 prompt 语言跟随的兜底
 * @returns UIMessageStream 响应（web 标准 Response）
 */
/** 检测伪造的 system 角色 UIMessage（SEC-02）：UIMessage 协议中 system 角色是
 *  客户端不可伪造的保留位——前端 useChat 只产生 user/assistant。携带 system 角色
 *  的消息经 convertToModelMessages 会成为独立 system 插入 LLM 上下文（真系统提示
 *  之后，最强注入位）。检测到即拒绝请求，不进入 streamText。 */
function hasForgedSystemMessage(messages: UIMessage[]): boolean {
  return messages.some((m) => m?.role === "system");
}

export async function handleChatRequest(
  messages: UIMessage[],
  signal: AbortSignal | undefined,
  env: ChatEnv,
  lang: ReplyLang = "zh",
): Promise<Response> {
  if (hasForgedSystemMessage(messages)) {
    return new Response(JSON.stringify({ error: "非法消息：包含 system 角色消息" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  // 模式判定 + 剥离传输前缀（每请求独立判定，纯函数复用）
  const isBuildMode = detectBuildMode(messages);
  const cleanMessages = stripModePrefix(messages);

  const systemPrompt = isBuildMode ? SYSTEM_PROMPT_BUILD(lang) : SYSTEM_PROMPT_SIMULATE(lang);

  // openai-compatible provider：默认走 Chat Completions API（/chat/completions），
  // 兼容 DeepSeek / 官方 OpenAI / 第三方网关 / Ollama（Node 与 workerd 均可运行）
  const provider = createOpenAICompatible({
    name: "openai",
    baseURL: env.OPENAI_BASE_URL,
    apiKey: env.OPENAI_API_KEY,
  });

  const result = streamText({
    model: provider(env.OPENAI_MODEL),
    system: systemPrompt,
    // 安全护栏（SEC-02）：客户端可伪造 role:"system" 的 UIMessage，转换后会作为
    // 独立 system 消息插入 LLM 上下文（排在真系统提示之后，是最强的注入位）。
    // false = messages 中出现 system 角色直接 AI_InvalidPromptError，不发起 LLM 请求。
    // 正常对话流（user/assistant/tool）不受影响；本调用自身的 system 参数不受影响。
    allowSystemInMessages: false,
    // ignoreIncompleteToolCalls: 过滤 input-streaming/input-available 的残缺 tool part
    //（用户中途 stop() 时会留下），否则转成 tool-call 无 tool-result → MissingToolResultsError
    messages: await convertToModelMessages(cleanMessages, { ignoreIncompleteToolCalls: true }),
    tools: buildTools(),
    // 停止条件：构建模式 run-model 后即停，兜底步数上限（env 可配置）
    // maxOutputTokens：单响应输出上限（成本护栏；工具调用参数也计入，4k 足够任一轮）
    stopWhen: isBuildMode
      ? [hasToolCall("run-model"), stepCountIs(env.BUILD_MAX_STEPS)]
      : stepCountIs(env.SIMULATE_MAX_STEPS),
    maxOutputTokens: env.MAX_OUTPUT_TOKENS,
    abortSignal: signal,
    // 诊断日志：区分"前端续发问题"与"LLM 厂商 API 问题"
    onError: (err) => {
      console.error(`[chat] streamText 错误 (mode=${isBuildMode ? "build" : "simulate"}, messages=${messages.length}):`, err);
    },
    onFinish: (event) => {
      console.log(
        `[chat] 完成 mode=${isBuildMode ? "build" : "simulate"} messages=${messages.length} ` +
          `finishReason=${event.finishReason} steps=${event.steps?.length ?? "?"} ` +
          `用时=${((event as { response?: { latencyMs?: number } }).response?.latencyMs ?? "?").toString()}ms`,
      );
    },
  });

  return result.toUIMessageStreamResponse();
}
