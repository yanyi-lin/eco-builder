import { useEffect, useRef, useState } from "react";
import type { UseEcoAgent } from "./useEcoAgent";
import { useI18n } from "../../i18n/LanguageProvider";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";

interface AgentChatDrawerProps {
  agent: UseEcoAgent;
  collapsed: boolean;
  onToggle: () => void;
}

/** 野账（AI 抽屉）：右侧笔记本式对话栏。
 *  收起时成为 52px 侧栏轨道（竖排标签，整条可点展开），
 *  展开时页头含状态点 + 状态词 + 收起钮 + 清空（两段式确认），
 *  下方依次为错误恢复条、消息流与输入区。 */
export function AgentChatDrawer({
  agent,
  collapsed,
  onToggle,
}: AgentChatDrawerProps) {
  const { t } = useI18n();
  const statusText = agent.isStreaming
    ? String(t("drawer.statusThinking"))
    : agent.status === "error"
      ? String(t("drawer.statusError"))
      : String(t("drawer.statusReady"));

  // 清空按钮「两段式确认」：第一次点击进入待确认态（3 秒内再点才执行），
  // 避免误触清空不可恢复的对话历史，又无需引入确认弹窗
  const [clearArmed, setClearArmed] = useState(false);
  const armTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (armTimerRef.current !== null) window.clearTimeout(armTimerRef.current);
    };
  }, []);
  const handleClear = () => {
    if (!clearArmed) {
      setClearArmed(true);
      armTimerRef.current = window.setTimeout(() => setClearArmed(false), 3000);
      return;
    }
    if (armTimerRef.current !== null) window.clearTimeout(armTimerRef.current);
    setClearArmed(false);
    agent.clearHistory();
  };

  // 收起态：整条竖排标签即展开开关
  if (collapsed) {
    return (
      <aside className="notebook collapsed">
        <button
          type="button"
          className="rail-toggle"
          onClick={onToggle}
          aria-expanded={false}
          aria-controls="notebook-inner"
          aria-label={String(t("drawer.expand"))}
          title={String(t("drawer.expand"))}
        >
          <span className="rail-label">{t("drawer.collapsedLabel")}</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="notebook">
      <div className="notebook-inner" id="notebook-inner">
        <header className="notebook-head">
          {/* 状态点 + 状态词：状态变化经 aria-live 播报给读屏用户 */}
          <span
            className={`status-dot${agent.status === "error" ? " err" : ""}${agent.isStreaming ? " busy" : ""}`}
            aria-hidden="true"
          />
          <span className="notebook-title">{t("drawer.title")}</span>
          <span className="notebook-status" role="status" aria-live="polite">
            {statusText}
          </span>
          {/* 清空（两段式确认） */}
          <button
            type="button"
            className={`clear-btn${clearArmed ? " armed" : ""}`}
            onClick={handleClear}
            disabled={agent.messages.length === 0}
            aria-label={String(t("drawer.clearAria"))}
            title={clearArmed ? String(t("drawer.clearConfirm")) : String(t("drawer.clear"))}
          >
            {clearArmed ? String(t("drawer.clearConfirm")) : String(t("drawer.clear"))}
          </button>
          {/* 收起（图标钮） */}
          <button
            type="button"
            className="icon-btn sm"
            onClick={onToggle}
            aria-expanded={true}
            aria-controls="notebook-inner"
            aria-label={String(t("drawer.collapse"))}
            title={String(t("drawer.collapse"))}
          >
            <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
              <path
                d="M4.5 2.5L8 6l-3.5 3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </header>
        {/* 请求失败时在消息区上方给出恢复入口 */}
        {agent.status === "error" && (
          <div className="error-bar" role="alert">
            <span>{t("chat.errorTitle")}</span>
            <button type="button" className="retry-btn" onClick={agent.regenerate}>
              {t("chat.retry")}
            </button>
          </div>
        )}
        <MessageList messages={agent.messages} onSample={agent.sendMessage} />
        <MessageInput
          onSend={agent.sendMessage}
          disabled={agent.isStreaming}
          onStop={agent.stop}
        />
      </div>
    </aside>
  );
}
