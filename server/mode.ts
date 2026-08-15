// ========================= 模式判定与前缀剥离（纯函数） =========================
// 从 worker/mode.ts 迁移（脱离 Cloudflare，原逻辑原样保留，见 MIGRATION-PLAN §4#5）。
// 服务端每次收到 /api/chat 请求时重新判定模式：构建模式靠用户消息里的
// [MODE: build] 传输前缀识别（前端 useEcoAgent 注入，MessageList 显示时剥离）。

import type { UIMessage } from "ai";

/** 协议前缀：前端在构建模式发送消息时注入，服务端据此识别构建模式 */
export const MODE_BUILD_PREFIX = "[MODE: build]";

/**
 * 检测当前是否为构建模式：从后往前找**最后一条 user 消息**检查前缀。
 * 不能用 messages 的最后一条——工具 auto-continuation 时最后一条是
 * assistant 工具消息（role !== "user"），会导致构建模式的工具续回合
 * 误判为 simulate（历史 issue #10 的核心混乱之一，保持语义不变）。
 */
export function detectBuildMode(messages: UIMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "user" || !Array.isArray(m.parts)) continue;
    for (const part of m.parts) {
      if (
        part.type === "text" &&
        typeof part.text === "string" &&
        part.text.includes(MODE_BUILD_PREFIX)
      ) {
        return true;
      }
    }
    break; // 只查最后一条 user 消息
  }
  return false;
}

/**
 * 剥离所有消息中的 [MODE: build] 协议前缀。
 * 前缀是前端→服务端的传输标记（仅用于模式判定），不应出现在 LLM 上下文里。
 */
export function stripModePrefix(messages: UIMessage[]): UIMessage[] {
  return messages.map((m) => ({
    ...m,
    parts: m.parts.map((p) =>
      p.type === "text" && typeof p.text === "string"
        ? { ...p, text: p.text.replace(/^\[MODE: build\]\s*/i, "") }
        : p,
    ),
  }));
}
