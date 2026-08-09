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
        builderRef.current.state.species = species;
      },
      addSpecies: (species) => builderRef.current.addSpecies(species),
      removeSpecies: (id) => builderRef.current.removeSpecies(id),
      addRelation: (relation) => builderRef.current.addRelation(relation),
      removeRelation: (index) => builderRef.current.removeRelation(index),
      setParams: (params) => {
        builderRef.current.state.params = params;
      },
      buildAndRun: (name, description) => builderRef.current.buildAndRun(name, description),
    }),
    [],
  );

  const { messages, sendMessage, status, isStreaming, clearHistory } =
    useAgentChat({
      agent,
      getInitialMessages: null,
      resume: false,
      autoContinueAfterToolResult: true,
      onToolCall: async ({ toolCall, addToolOutput }) => {
        const toolName = toolCall.toolName;
        const args =
          (toolCall.input && typeof toolCall.input === "object"
            ? toolCall.input
            : {}) as Record<string, unknown>;

        try {
          let output: unknown;
          
          // 根据模式分发工具执行
          if (modeRef.current === "build") {
            output = await executeBuilderTool(toolName, args, builderApi);
          } else {
            output = executeTool(toolName, args, simApi);
          }
          
          addToolOutput({
            toolCallId: toolCall.toolCallId,
            output: output as Record<string, unknown>,
          });
        } catch (err) {
          addToolOutput({
            toolCallId: toolCall.toolCallId,
            output: {
              error: `工具执行失败: ${err instanceof Error ? err.message : String(err)}`,
            },
          });
        }
      },
    });

  const send = (text: string) => {
    sendMessage({ text });
  };

  return {
    messages,
    status,
    isStreaming,
    sendMessage: send,
    clearHistory,
  };
}
