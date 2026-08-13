// ========================= 模式判定与前缀剥离（纯函数） =========================
// 从 EcoChatAgent.onChatMessage 中抽取的纯逻辑，便于 node/vitest 单元测试
// （worker 端无法在纯 node 环境实例化，故把无 I/O 的部分抽成独立模块）。

import type { UIMessage } from "ai";

/** 协议前缀：前端在构建模式发送消息时注入，worker 据此识别构建模式 */
export const MODE_BUILD_PREFIX = "[MODE: build]";

/**
 * 检测当前是否为构建模式：从后往前找**最后一条 user 消息**检查前缀。
 * 不能用 messages 的最后一条——工具 auto-continuation 时最后一条是
 * assistant 工具消息（role !== "user"），会导致构建模式的工具续回合
 * 误判为 simulate（issue #10 的核心混乱之一）。
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
 * 前缀是前端→worker 的传输标记（仅用于模式判定），不应出现在 LLM 上下文里——
 * 否则 LLM 会误读历史消息为"用户主动标记模式"，造成"用户没切模式但 agent
 * 以为切了"的混乱（issue #10）。
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
