import { useMemo, useRef } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import type { UIMessage } from "ai";
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
 * 组合 useAgent + useAgentChat，根据当前模式分发工具执行。
 * 模拟模式：执行生态模拟工具（read/set/start/pause/restart）
 * 构建模式：执行 builder 工具（search-species/query-interactions/add-species 等）
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

  const agent = useAgent({
    agent: "EcoChat",
    name: sessionId,
  });

  const hasRead = useRef(false);

  // 构造 EcoApi，使用 ref 持有最新 sim 状态避免闭包陷阱
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
        // 直接调用 builder 的 setSpecies 方法
        builderRef.current.api.setSpecies(species);
      },
      addSpecies: (species) => builderRef.current.addSpecies(species),
      removeSpecies: (id) => builderRef.current.removeSpecies(id),
      addRelation: (relation) => builderRef.current.addRelation(relation),
      removeRelation: (index) => builderRef.current.removeRelation(index),
      setParams: (params) => {
        // 直接调用 builder 的 setParams 方法
        builderRef.current.api.setParams(params);
      },
      buildAndRun: (spec) => {
        builderRef.current.buildAndRun(spec);
      },
    }),
    [],
  );

  // 工具执行串行链：useAgentChat 可能并发触发多个 onToolCall（尤其构建模式
  // 连续 add-species/add-relation）。并发工具完成时多个 setState 同时触发，
  // 在 React 19 + autoContinue 下易引发"Maximum update depth exceeded"（#185）。
  // 用 Promise 链把所有工具执行排成串行，每次只处理一个。
  const toolChainRef = useRef<Promise<unknown>>(Promise.resolve());

  const { messages, sendMessage, status, isStreaming, clearHistory } =
    useAgentChat({
      agent,
      getInitialMessages: null,
      resume: false,
      autoContinueAfterToolResult: true,
      // 节流 useSyncExternalStore 订阅通知（AI SDK 官方逃生通道，上游 #1361/#1732）：
      // agents 0.17.4 每帧同步 setMessages + ReactChatState 同步 fan-out，
      // 在连续工具调用的密集帧窗口内触发 React #185（嵌套更新超限）。
      // 0.18.0 已加 resume 串行门治本，此处再加节流作双保险。
      experimental_throttle: 32,
      onToolCall: async ({ toolCall, addToolOutput }) => {
        const toolName = toolCall.toolName;
        const args =
          (toolCall.input && typeof toolCall.input === "object"
            ? toolCall.input
            : {}) as Record<string, unknown>;

        // 加入串行队列：工具执行 + addToolOutput 整体串行，
        // 确保并发工具调用的 setState 不会同时触发（React #185 防护）
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
        addToolOutput({
          toolCallId: toolCall.toolCallId,
          output: errText ? { error: errText } : (output as Record<string, unknown>),
        });
      },
    });

  const send = (text: string) => {
    // 在构建模式下，自动添加模式标记，让 LLM 知道当前模式
    const modePrefix = modeRef.current === "build" ? "[MODE: build] " : "";
    sendMessage({ text: modePrefix + text });
  };

  return {
    messages,
    status,
    isStreaming,
    sendMessage: send,
    clearHistory,
  };
}
