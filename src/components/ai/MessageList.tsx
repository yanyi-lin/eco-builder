import { useEffect, useMemo, useRef } from "react";
import type { UIMessage } from "ai";
import { getToolName, isToolUIPart } from "ai";
import { useI18n } from "../../i18n/LanguageProvider";

interface MessageListProps {
  messages: UIMessage[];
  /** 空状态示例 chip 点击时直接发送该示例（原空状态为纯文本说明，不可操作） */
  onSample: (text: string) => void;
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

export function MessageList({ messages, onSample }: MessageListProps) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  // 智能滚底：仅当用户本来就停在底部附近（80px 容差）时才跟随新消息滚动，
  // 向上翻阅历史时保持位置（修复：原实现每次流式更新都强制拉回底部）
  const isNearBottomRef = useRef(true);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      isNearBottomRef.current =
        el.scrollTop + el.clientHeight >= el.scrollHeight - 80;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!isNearBottomRef.current) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  if (messages.length === 0) {
    const samples = [
      String(t("chat.sample1")),
      String(t("chat.sample2")),
      String(t("chat.sample3")),
    ];
    return (
      <div className="ai-empty">
        <div className="ai-empty-intro">
          {t("chat.emptyIntro")}<br />
          {t("chat.emptyGuide")}
        </div>
        <ul className="ai-empty-list">
          <li>{t("chat.emptyRead")}</li>
          <li>{t("chat.emptySet")}</li>
          <li>{t("chat.emptyControl")}</li>
          <li>{t("chat.emptyBuild")}</li>
        </ul>
        <div className="ai-empty-try">{t("chat.emptyTry")}</div>
        <div className="ai-empty-chips">
          {samples.map((s) => (
            <button
              key={s}
              type="button"
              className="ai-sample-chip"
              onClick={() => onSample(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="ai-messages" ref={containerRef}>
      {messages.map((msg) => (
        <MessageItem key={msg.id} msg={msg} />
      ))}
      <div ref={endRef} />
    </div>
  );
}

function MessageItem({ msg }: { msg: UIMessage }) {
  const { t } = useI18n();
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
        // ai v6 ToolUIPart 直接带 input/output 字段（迁移自 @cloudflare/ai-chat/react 的
        // getToolInput/getToolOutput——纯字段读取，现内联等价实现）
        const input = (part as { input?: unknown }).input;
        const output = (part as { output?: unknown }).output;
        const isError =
          (part as unknown as { state?: string }).state === "output-error" ||
          (output !== undefined &&
            typeof output === "object" &&
            output !== null &&
            "error" in (output as Record<string, unknown>));
        const summary = formatToolSummary(name, input);
        // 工具状态用文字呈现（原 ✓/❌ 符号会被读屏读作"对勾/叉号"，语义不明）
        const stateText = isError ? t("chat.toolFailed") : t("chat.toolDone");
        return (
          <div key={`${msg.id}-tool-${i}`} className={`ai-tool-chip${isError ? " error" : ""}`}>
            {name}
            {summary ? ` · ${summary}` : ""}
            {` · ${stateText}`}
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
