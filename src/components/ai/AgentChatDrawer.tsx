import type { UseEcoAgent } from "./useEcoAgent";
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
  const statusText = agent.isStreaming
    ? "思考中..."
    : agent.status === "error"
      ? "出错"
      : "就绪";

  return (
    <div className={`ai-drawer${collapsed ? " collapsed" : ""}`}>
      <button
        className="ai-drawer-toggle"
        onClick={onToggle}
        title={collapsed ? "展开智能体助手" : "收起智能体助手"}
      >
        {collapsed ? "智能体" : "智能体助手"}
      </button>

      {!collapsed && (
        <>
          <div className="ai-drawer-header">
            <span className="ai-drawer-title">智能体助手</span>
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
