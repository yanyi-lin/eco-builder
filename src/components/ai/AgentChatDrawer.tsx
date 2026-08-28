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

  return (
    <div className={`ai-drawer${collapsed ? " collapsed" : ""}`}>
      <button
        className="ai-drawer-toggle"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-controls="ai-drawer-body"
        title={collapsed ? String(t("drawer.expand")) : String(t("drawer.collapse"))}
      >
        {collapsed ? String(t("drawer.collapsedLabel")) : String(t("drawer.expandedLabel"))}
      </button>

      {!collapsed && (
        <>
          <div className="ai-drawer-header" id="ai-drawer-body">
            <span className="ai-drawer-title">{t("drawer.title")}</span>
            {/* 状态变化通过 aria-live 播报给读屏用户（思考中/就绪/出错） */}
            <span
              className={`ai-drawer-status${agent.isStreaming ? " streaming" : ""}`}
              role="status"
              aria-live="polite"
            >
              {statusText}
            </span>
            <button
              className={`ai-drawer-clear${clearArmed ? " armed" : ""}`}
              onClick={handleClear}
              disabled={agent.messages.length === 0}
              aria-label={String(t("drawer.clearAria"))}
              title={clearArmed ? String(t("drawer.clearConfirm")) : String(t("drawer.clear"))}
            >
              {clearArmed ? String(t("drawer.clearConfirm")) : String(t("drawer.clear"))}
            </button>
          </div>
          {/* 请求失败时在消息区顶部给出恢复入口（原实现仅在角落显示两字「出错」） */}
          {agent.status === "error" && (
            <div className="ai-error-bar" role="alert">
              <span>{t("chat.errorTitle")}</span>
              <button className="ai-retry-btn" onClick={agent.regenerate}>
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
        </>
      )}
    </div>
  );
}
