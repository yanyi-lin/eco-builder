import { useMemo, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { isToolUIPart, type UIMessage } from "ai";
import type { UseEcoSimulation } from "../../eco/useEcoSimulation";
import type { UseEcoBuilder } from "../../eco/useEcoBuilder";
import { executeTool, type EcoApi } from "../../tools/ecoTools";
import { executeBuilderTool, type BuilderApi } from "../../tools/builderTools";

export interface UseEcoAgent {
  messages: UIMessage[];
  status: "ready" | "submitted" | "streaming" | "error" | string;
  isStreaming: boolean;
  sendMessage: (text: string) => void;
  clearHistory: () => void;
}

/**
 * 组合 useChat（Vercel AI SDK），根据当前模式分发工具执行。
 * 迁移自 useAgent + useAgentChat（Cloudflare Agents），MIGRATION-PLAN §4 要点：
 * - useChat 从 @ai-sdk/react 导入（ai@6 无 ai/react 子路径）
 * - onToolCall 执行工具后用 useChat 返回的 addToolOutput 写入结果
 * - sendAutomaticallyWhen 复刻 CF 版 autoContinueAfterToolResult: true
 *   （最后一条 assistant 消息含已完成工具输出 → 自动续发下一轮）
 * - 工具执行串行链保留（双保险，防 React #185 重渲染风暴）
 */
export function useEcoAgent(
  sim: UseEcoSimulation,
  builder: UseEcoBuilder,
  mode: "simulate" | "build"
): UseEcoAgent {
  const sessionId = useMemo(() => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }, []);

  const hasRead = useRef(false);

  // 构造 EcoApi，使用 ref 持有最新 sim 状态避免闭包陷阱（与 CF 版一致）
  const simRef = useRef(sim);
  simRef.current = sim;

  const builderRef = useRef(builder);
  builderRef.current = builder;

  const modeRef = useRef(mode);
  modeRef.current = mode;

  const simApi: EcoApi = useMemo(
    () => ({
      get spec() {
        return simRef.current.spec;
      },
      get populations() {
        return simRef.current.populations;
      },
      get currentTime() {
        return simRef.current.currentTime;
      },
      get simulationRunning() {
        return simRef.current.simulationRunning;
      },
      get simulationActive() {
        return simRef.current.simulationActive;
      },
      hasRead,
      setPopulation: (vals) => simRef.current.setPopulation(vals),
      startSimulation: () => simRef.current.startSimulation(),
      pauseSimulation: () => simRef.current.pauseSimulation(),
      fullReset: () => simRef.current.fullReset(),
    }),
    [],
  );

  const builderApi: BuilderApi = useMemo(
    () => ({
      get state() {
        return builderRef.current.state;
      },
      setSpecies: (species) => {
        builderRef.current.api.setSpecies(species);
      },
      addSpecies: (species) => builderRef.current.addSpecies(species),
      removeSpecies: (id) => builderRef.current.removeSpecies(id),
      addRelation: (relation) => builderRef.current.addRelation(relation),
      removeRelation: (index) => builderRef.current.removeRelation(index),
      setParams: (params) => {
        builderRef.current.api.setParams(params);
      },
      buildAndRun: (spec) => {
        builderRef.current.buildAndRun(spec);
      },
    }),
    [],
  );

  // 工具执行串行链：SDK 层已强制串行（onToolCall 被 await），保留链作双保险，
  // 确保工具执行 + addToolOutput 整体排队（React #185 防护）
  const toolChainRef = useRef<Promise<unknown>>(Promise.resolve());

  const chat = useChat({
    id: sessionId,
    // api 默认 /api/chat（ai@6 HttpChatTransport 默认值，与本项目 Node 服务端一致）
    // 节流 useSyncExternalStore 订阅通知（AI SDK 官方逃生通道）：
    // 连续工具调用的密集帧窗口内触发 React #185（嵌套更新超限），与 CF 版同款防护
    experimental_throttle: 32,
    // 等价 CF 版 autoContinueAfterToolResult: true：
    // 最后一条 assistant 消息含已完成工具输出（output-available/output-error）
    // 即自动续发下一轮；LLM 给出纯文本回复（无工具 part）时停止
    sendAutomaticallyWhen: ({ messages }) => {
      const last = messages[messages.length - 1];
      // 只检查最后一部分（修复 2026-08-15 无限循环）：
      // ai 6.0.230 useChat 续发时基于占位消息累积 parts（replace 而非 push），
      // 历史的 output-available 工具 part 会永远留在消息里——若检查"任意
      // output-available part"会恒 true → 无限续发。改为检查末尾：
      // 续发响应把新的 text/tool parts 追加到末尾，末尾是已完成工具输出才续发
      // （等价 CF 版 autoContinueAfterToolResult），纯文本收尾则停止。
      if (!last || last.role !== "assistant") return false;
      const lastPart = last.parts[last.parts.length - 1];
      return (
        isToolUIPart(lastPart) &&
        (lastPart.state === "output-available" || lastPart.state === "output-error")
      );
    },
    onToolCall: async ({ toolCall }) => {
      const toolName = String(toolCall.toolName);
      const args =
        (toolCall.input && typeof toolCall.input === "object"
          ? toolCall.input
          : {}) as Record<string, unknown>;

      // 加入串行队列：工具执行整体串行（与 CF 版 toolChainRef 语义一致）
      const myRun = toolChainRef.current.then(async () => {
        let output: unknown;
        // 根据模式分发工具执行
        if (modeRef.current === "build") {
          output = await executeBuilderTool(toolName, args, builderApi);
        } else {
          output = await executeTool(toolName, args, simApi);
        }
        return output;
      });
      // 更新链尾（供下一个工具排队）；异常时链不中断
      toolChainRef.current = myRun.catch(() => undefined);

      let output: unknown;
      let errText: string | undefined;
      try {
        output = await myRun;
      } catch (err) {
        errText = `工具执行失败: ${err instanceof Error ? err.message : String(err)}`;
      }
      // 写入工具结果。**不能 await**：SDK 处理工具 chunk（含 onToolCall）时正占用其
      // 内部 SerialJobExecutor，await addToolOutput（内部再入队）会死锁——J2 等 J1，
      // J1 等 onToolCall，onToolCall 等 J2，永久挂起（表现为"工具调用后卡住、无报错"）。
      // 不 await 时 addToolOutput 任务会在当前 chunk 处理完成后由队列立即执行，
      // 先于流结束后的 sendAutomaticallyWhen 检查，时序正确（诊断修复 2026-08-15）。
      Promise.resolve()
        .then(() =>
          chat.addToolOutput({
            toolCallId: toolCall.toolCallId,
            tool: toolName,
            output: errText ? { error: errText } : (output as Record<string, unknown>),
          }),
        )
        .catch((err) => {
          console.warn("[useEcoAgent] addToolOutput 失败:", err);
        });
    },
  });

  const send = (text: string) => {
    // 构建模式下自动添加模式标记（服务端据此判定模式并剥离，MessageList 显示时剥离）
    const modePrefix = modeRef.current === "build" ? "[MODE: build] " : "";
    chat.sendMessage({ text: modePrefix + text });
  };

  return {
    messages: chat.messages,
    status: chat.status,
    // useChat 无 isStreaming，由 status 推导（submitted=已提交/streaming=流式）
    isStreaming: chat.status === "submitted" || chat.status === "streaming",
    sendMessage: send,
    clearHistory: () => chat.setMessages([]),
  };
}
