import { useState, type KeyboardEvent } from "react";
import { useI18n } from "../../i18n/LanguageProvider";

interface MessageInputProps {
  onSend: (text: string) => void;
  disabled: boolean;
}

export function MessageInput({ onSend, disabled }: MessageInputProps) {
  const { t } = useI18n();
  const [text, setText] = useState("");

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter 发送，Shift+Enter 换行
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="ai-input-row">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? String(t("chat.inputThinking")) : String(t("chat.inputPlaceholder"))}
        disabled={disabled}
        rows={1}
      />
      <button
        className="ai-send-btn"
        onClick={send}
        disabled={disabled || !text.trim()}
        aria-label={String(t("chat.send"))}
        title={String(t("chat.send"))}
      >
        ➤
      </button>
    </div>
  );
}
