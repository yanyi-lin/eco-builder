import { useEffect, useMemo, useRef } from "react";
import type { UIMessage } from "ai";
import { getToolName, isToolUIPart } from "ai";
import { getToolInput, getToolOutput } from "@cloudflare/ai-chat/react";

interface MessageListProps {
  messages: UIMessage[];
}

// marked + DOMPurify 从 CDN 加载（index.html 引入），挂到 window
declare global {
  interface Window {
    marked?: { parse: (src: string) => string };
    DOMPurify?: { sanitize: (html: string) => string };
  }
}

function renderMarkdown(text: string): string {
  const { marked, DOMPurify } = window;
  if (!marked || !DOMPurify) return text;
  try {
    const html = marked.parse(text);
    return DOMPurify.sanitize(html);
  } catch {
    return text;
  }
}

export function MessageList({ messages }: MessageListProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="ai-empty">
        🤖 我是生态模拟器 AI 助手。<br />
        可以用自然语言让我：<br />
        · 读取当前种群数量<br />
        · 设置某物种数量<br />
        · 启动 / 暂停 / 重置模拟<br />
        · 切换到【构建模式】搭建全新的生态模型（如"构建森林生态系统"）<br /><br />
        试试说：「读取当前种群，然后把某个物种的数量设为 30」
      </div>
    );
  }

  return (
    <div className="ai-messages">
      {messages.map((msg) => (
        <MessageItem key={msg.id} msg={msg} />
      ))}
      <div ref={endRef} />
    </div>
  );
}

function MessageItem({ msg }: { msg: UIMessage }) {
  const isUser = msg.role === "user";

  // 收集 text parts 与 tool parts
  const textParts = useMemo(
    () => msg.parts.filter((p): p is { type: "text"; text: string } => p.type === "text"),
    [msg],
  );
  const toolParts = useMemo(
    () => msg.parts.filter((p) => isToolUIPart(p)),
    [msg],
  );

  // 用户消息的文本可能带 [MODE: build] 协议前缀（useEcoAgent 发送时注入，
  // worker 靠它识别构建模式）。它是传输标记，不应展示给用户——渲染时剥离。
  const rawText = textParts.map((p) => p.text).join("\n");
  const text = isUser ? rawText.replace(/^\[MODE: build\]\s*/i, "") : rawText;

  return (
    <>
      {text && (
        <div
          className={`ai-msg ${isUser ? "user" : "assistant"}`}
          {...(isUser
            ? {}
            : { dangerouslySetInnerHTML: { __html: renderMarkdown(text) } })}
        >
          {isUser ? text : null}
        </div>
      )}
      {toolParts.map((part, i) => {
        const name = (() => {
          try {
            return getToolName(part);
          } catch {
            return "tool";
          }
        })();
        const input = (() => {
          try {
            return getToolInput(part);
          } catch {
            return undefined;
          }
        })();
        // 错误判定双通道：part.state === "output-error"（SDK 层面标记）
        // 或工具输出对象含 error 字段（executeTool/executeBuilderTool 返回
        // {error: "..."} 时 state 仍为 output-available，历史 bug 导致
        // "未知工具"却显示 ✓，见 issue #10）。
        const output = (() => {
          try {
            return getToolOutput(part);
          } catch {
            return undefined;
          }
        })();
        const isError =
          (part as unknown as { state?: string }).state === "output-error" ||
          (output !== undefined &&
            typeof output === "object" &&
            output !== null &&
            "error" in (output as Record<string, unknown>));
        const summary = formatToolSummary(name, input);
        return (
          <div key={`${msg.id}-tool-${i}`} className={`ai-tool-chip${isError ? " error" : ""}`}>
            🔧 {name}
            {summary ? ` · ${summary}` : ""}
            {isError ? " · ❌" : " · ✓"}
          </div>
        );
      })}
    </>
  );
}

function formatToolSummary(name: string, input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const obj = input as Record<string, unknown>;
  if (name === "animal-population-set") {
    const entries = Object.entries(obj)
      .filter(([, v]) => typeof v === "number")
      .map(([k, v]) => `${k}=${v}`);
    return entries.join(", ");
  }
  return "";
}
