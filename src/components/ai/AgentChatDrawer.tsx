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

  return (
    <div className={`ai-drawer${collapsed ? " collapsed" : ""}`}>
      <button
        className="ai-drawer-toggle"
        onClick={onToggle}
        title={collapsed ? String(t("drawer.expand")) : String(t("drawer.collapse"))}
      >
        {collapsed ? String(t("drawer.collapsedLabel")) : String(t("drawer.expandedLabel"))}
      </button>

      {!collapsed && (
        <>
          <div className="ai-drawer-header">
            <span className="ai-drawer-title">{t("drawer.title")}</span>
            <span className={`ai-drawer-status${agent.isStreaming ? " streaming" : ""}`}>
              {statusText}
            </span>
          </div>
          <MessageList messages={agent.messages} />
          <MessageInput
            onSend={agent.sendMessage}
            disabled={agent.isStreaming}
          />
        </>
      )}
    </div>
  );
}
