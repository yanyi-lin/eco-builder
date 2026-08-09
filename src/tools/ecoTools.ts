import type { MutableRefObject } from "react";
import type {
  EcoModelSpec,
  EcoSnapshot,
  Populations,
} from "../eco/types";
import type { UseEcoSimulation } from "../eco/useEcoSimulation";

/**
 * 工具执行器依赖的生态 API。
 * 由 useEcoAgent 从 useEcoSimulation 适配而来，供 onToolCall 闭包使用。
 */
export interface EcoApi {
  spec: EcoModelSpec;
  populations: Populations;
  currentTime: number;
  simulationRunning: boolean;
  simulationActive: boolean;
  /** 会话级「是否已读取」标志：set 前必须为 true，会话内读过一次即有效 */
  hasRead: MutableRefObject<boolean>;
  setPopulation: UseEcoSimulation["setPopulation"];
  startSimulation: UseEcoSimulation["startSimulation"];
  pauseSimulation: UseEcoSimulation["pauseSimulation"];
  fullReset: UseEcoSimulation["fullReset"];
}

/** read-animal-data 工具结果 */
export type ReadToolResult = EcoSnapshot;

/** animal-population-set 工具结果 */
export interface SetToolResult {
  applied: Populations;
  clamped: string[];
  unknownSpecies: string[];
}

/** 控制类工具（start/pause/restart）结果 */
export interface ControlToolResult {
  action: "start" | "pause" | "restart";
  simulationRunning: boolean;
  simulationActive: boolean;
  populations: Populations;
  currentTime: number;
}

/** 错误结果 */
export interface ToolError {
  error: string;
}

/** 读取当前生态快照（read-animal-data） */
export function readAnimalData(api: EcoApi): ReadToolResult {
  api.hasRead.current = true;
  const snap: EcoSnapshot = {
    model: {
      id: api.spec.id,
      name: api.spec.name,
      description: api.spec.description,
    },
    species: api.spec.species.map((s) => ({
      id: s.id,
      name: s.name,
      value: api.populations[s.id] ?? 0,
      minValue: s.minValue,
      axis: s.axis,
    })),
    relations: api.spec.relations.map((r) => {
      if (r.type === "predation") {
        return { type: r.type, prey: r.prey, predator: r.predator };
      } else {
        return { type: r.type, species1: r.species1, species2: r.species2 };
      }
    }),
    currentTime: api.currentTime,
    simulationRunning: api.simulationRunning,
    simulationActive: api.simulationActive,
  };
  return snap;
}

/** 设置种群数量（animal-population-set），强制「必须先 read」约束 */
export function animalPopulationSet(
  api: EcoApi,
  vals: Record<string, number>,
): SetToolResult | ToolError {
  if (!api.hasRead.current) {
    return {
      error:
        "必须先调用 read-animal-data 读取当前数据，才能设置种群数量。请先读取后再设置。",
    };
  }
  const result = api.setPopulation(vals);
  return result;
}

/** 启动/继续模拟（start） */
export function startSim(api: EcoApi): ControlToolResult {
  api.startSimulation();
  return {
    action: "start",
    simulationRunning: true,
    simulationActive: true,
    populations: api.populations,
    currentTime: api.currentTime,
  };
}

/** 暂停模拟（pause） */
export function pauseSim(api: EcoApi): ControlToolResult {
  api.pauseSimulation();
  return {
    action: "pause",
    simulationRunning: false,
    simulationActive: api.simulationActive,
    populations: api.populations,
    currentTime: api.currentTime,
  };
}

/** 重置模拟（restart） */
export function restartSim(api: EcoApi): ControlToolResult {
  api.fullReset();
  return {
    action: "restart",
    simulationRunning: false,
    simulationActive: false,
    populations: api.populations,
    currentTime: api.currentTime,
  };
}

/**
 * 工具分发器：根据工具名执行对应工具，返回 JSON 可序列化结果。
 * 由 useEcoAgent 的 onToolCall 调用。
 */
export function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  api: EcoApi,
): unknown {
  switch (toolName) {
    case "read-animal-data":
      return readAnimalData(api);
    case "animal-population-set":
      return animalPopulationSet(api, args as Record<string, number>);
    case "start":
      return startSim(api);
    case "pause":
      return pauseSim(api);
    case "restart":
      return restartSim(api);
    default:
      return { error: `未知工具: ${toolName}` };
  }
}
