import { useRef, useState, type KeyboardEvent } from "react";
import { useI18n } from "../../i18n/LanguageProvider";

interface MessageInputProps {
  onSend: (text: string) => void;
  /** 流式回复进行中：输入禁用，发送按钮切换为停止按钮 */
  disabled: boolean;
  /** 中断当前流式回复（流式期间发送按钮变为停止按钮） */
  onStop: () => void;
}

export function MessageInput({ onSend, disabled, onStop }: MessageInputProps) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    // 发送后恢复单行高度
    if (textareaRef.current) {
      textareaRef.current.style.height = "";
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter 发送，Shift+Enter 换行
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  // 自适应高度：随内容增高，超出 CSS max-height 后内部滚动
  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  return (
    <div className="composer">
      <textarea
        ref={textareaRef}
        className="composer-input"
        name="message"
        autoComplete="off"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          autoResize(e.target);
        }}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? String(t("chat.inputThinking")) : String(t("chat.inputPlaceholder"))}
        disabled={disabled}
        rows={1}
        enterKeyHint="send"
        aria-label={String(t("chat.inputAria"))}
      />
      {disabled ? (
        // 流式期间提供停止入口（发送钮让位给停止钮）
        <button
          type="button"
          className="composer-send stop"
          onClick={onStop}
          aria-label={String(t("chat.stopAria"))}
          title={String(t("chat.stop"))}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          className="composer-send"
          onClick={send}
          disabled={!text.trim()}
          aria-label={String(t("chat.send"))}
          title={String(t("chat.send"))}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M3 20.5 21.5 12 3 3.5v6.6l11 1.9-11 1.9z" fill="currentColor" />
          </svg>
        </button>
      )}
    </div>
  );
}
