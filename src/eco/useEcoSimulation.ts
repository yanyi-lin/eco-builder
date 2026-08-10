import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  EcoModelSpec,
  EcoParams,
  Populations,
} from "./types";
import { derivatives } from "./derivatives";
import { MAX_DATA_POINTS, SIM_INTERVAL_MS } from "./constants";

export interface SetPopulationResult {
  /** 实际写入的值（已 clamp） */
  applied: Populations;
  /** 被 clamp 到最小阈值的物种 id 列表 */
  clamped: string[];
  /** spec 中不存在的物种 id 列表 */
  unknownSpecies: string[];
}

export interface UseEcoSimulation {
  spec: EcoModelSpec;
  params: EcoParams;
  populations: Populations;
  currentTime: number;
  /** 各物种的历史数据数组（用于图表） */
  history: Record<string, number[]>;
  timeData: number[];
  simulationRunning: boolean;
  simulationActive: boolean;
  /** 步进一次（仅 simulationRunning 时生效） */
  stepSimulation: () => void;
  startSimulation: () => void;
  pauseSimulation: () => void;
  resumeSimulation: () => void;
  fullReset: () => void;
  applyDisturbance: (speciesId: string, percent: number) => void;
  /** 部分更新种群数量（AI 工具用），自动 clamp 到最小阈值 */
  setPopulation: (vals: Partial<Record<string, number>>) => SetPopulationResult;
  /** 应用 Eco-Tuner 修改后的参数并重置 */
  applyParams: (newParams: EcoParams) => void;
  /** 读取当前快照（AI 工具用） */
  getSnapshot: () => {
    populations: Populations;
    currentTime: number;
    simulationRunning: boolean;
    simulationActive: boolean;
  };
}

/** 从 spec + params 生成初始 populations */
function initialPopulations(spec: EcoModelSpec, params: EcoParams): Populations {
  const pops: Populations = {};
  for (const s of spec.species) {
    // 初始值参数键约定为 "<Id>0"，如 P0/H0/L0；若无则用 species.initial
    const initKey = `${s.id.charAt(0).toUpperCase()}${s.id.slice(1)}0`;
    pops[s.id] = params[initKey] ?? s.initial;
  }
  return pops;
}

/** 初始化历史数组 */
function initialHistory(spec: EcoModelSpec, pops: Populations): Record<string, number[]> {
  const h: Record<string, number[]> = {};
  for (const s of spec.species) {
    h[s.id] = [pops[s.id]];
  }
  return h;
}

export function useEcoSimulation(spec: EcoModelSpec): UseEcoSimulation {
  const [params, setParams] = useState<EcoParams>(() => ({ ...spec.params }));
  const [populations, setPopulations] = useState<Populations>(() =>
    initialPopulations(spec, spec.params),
  );
  const [currentTime, setCurrentTime] = useState(0.0);
  const [history, setHistory] = useState<Record<string, number[]>>(() =>
    initialHistory(spec, initialPopulations(spec, spec.params)),
  );
  const [timeData, setTimeData] = useState<number[]>([0]);
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [simulationActive, setSimulationActive] = useState(false);

  const timerId = useRef<ReturnType<typeof setInterval> | null>(null);

  // 用 ref 持有最新状态，供 stepSimulation 闭包读取（setInterval 闭包陷阱）
  const stateRef = useRef({ populations, params, currentTime });
  stateRef.current = { populations, params, currentTime };

  const clearTimer = useCallback(() => {
    if (timerId.current !== null) {
      clearInterval(timerId.current);
      timerId.current = null;
    }
  }, []);

  const stepSimulation = useCallback(() => {
    setSimulationRunning((running) => {
      if (!running) return running;
      const cur = stateRef.current;
      const d = derivatives(spec, cur.params, cur.populations);
      const dt = cur.params.dt ?? spec.dt;
      const next: Populations = { ...cur.populations };
      for (const s of spec.species) {
        let v = (cur.populations[s.id] ?? 0) + (d[s.id] ?? 0) * dt;
        // 防御：NaN/Infinity 时回退到最小阈值（参数缺失等异常不会传播）
        if (!isFinite(v)) v = s.minValue;
        // 下限：最小阈值
        if (v < s.minValue) v = s.minValue;
        // 上限：logistic 物种不超过 K * maxCapacityRatio（原版 plant 行为）
        if (s.hasLogistic && s.carryingCapacity && s.maxCapacityRatio) {
          const cap = cur.params[s.carryingCapacity] * s.maxCapacityRatio;
          if (v > cap) v = cap;
        }
        next[s.id] = v;
      }
      const nextTime = cur.currentTime + dt;

      setPopulations(next);
      setCurrentTime(nextTime);
      setHistory((prev) => {
        const updated: Record<string, number[]> = {};
        for (const s of spec.species) {
          const arr = [...(prev[s.id] ?? []), next[s.id]];
          while (arr.length > MAX_DATA_POINTS) arr.shift();
          updated[s.id] = arr;
        }
        return updated;
      });
      setTimeData((prev) => {
        const arr = [...prev, nextTime];
        while (arr.length > MAX_DATA_POINTS) arr.shift();
        return arr;
      });
      return running;
    });
  }, [spec]);

  const startSimulation = useCallback(() => {
    clearTimer();
    setSimulationRunning(true);
    setSimulationActive(true);
    timerId.current = setInterval(stepSimulation, SIM_INTERVAL_MS);
  }, [clearTimer, stepSimulation]);

  const pauseSimulation = useCallback(() => {
    clearTimer();
    setSimulationRunning(false);
  }, [clearTimer]);

  const resumeSimulation = useCallback(() => {
    clearTimer();
    setSimulationRunning(true);
    timerId.current = setInterval(stepSimulation, SIM_INTERVAL_MS);
  }, [clearTimer, stepSimulation]);

  const fullReset = useCallback(() => {
    clearTimer();
    const pops0 = initialPopulations(spec, stateRef.current.params);
    setPopulations(pops0);
    setCurrentTime(0.0);
    setHistory(initialHistory(spec, pops0));
    setTimeData([0]);
    setSimulationRunning(false);
    setSimulationActive(false);
  }, [clearTimer, spec]);

  const applyDisturbance = useCallback(
    (speciesId: string, percent: number) => {
      const s = spec.species.find((x) => x.id === speciesId);
      if (!s) return;
      setPopulations((prev) => {
        const cur = prev[speciesId] ?? 0;
        let newVal = cur * (1 - percent);
        if (newVal < s.minValue) newVal = s.minValue;
        return { ...prev, [speciesId]: newVal };
      });
      // 同步更新历史末位（原版行为：扰动后末位点立即反映新值）
      setHistory((prev) => {
        const updated: Record<string, number[]> = {};
        for (const sp of spec.species) {
          const arr = prev[sp.id] ? [...prev[sp.id]] : [];
          if (sp.id === speciesId && arr.length > 0) {
            const cur = arr[arr.length - 1];
            let newVal = cur * (1 - percent);
            if (newVal < s.minValue) newVal = s.minValue;
            arr[arr.length - 1] = newVal;
          }
          updated[sp.id] = arr;
        }
        return updated;
      });
    },
    [spec],
  );

  const setPopulation = useCallback(
    (vals: Partial<Record<string, number>>): SetPopulationResult => {
      const applied: Populations = {};
      const clamped: string[] = [];
      const unknownSpecies: string[] = [];
      const updates: Populations = {};

      for (const [id, rawVal] of Object.entries(vals)) {
        const s = spec.species.find((x) => x.id === id);
        if (!s) {
          unknownSpecies.push(id);
          continue;
        }
        // 跳过非数字值
        if (typeof rawVal !== "number" || !isFinite(rawVal)) {
          unknownSpecies.push(id);
          continue;
        }
        let v = rawVal;
        if (v < s.minValue) {
          v = s.minValue;
          clamped.push(id);
        }
        updates[id] = v;
        applied[id] = v;
      }

      if (Object.keys(updates).length > 0) {
        setPopulations((prev) => ({ ...prev, ...updates }));
        // 同步历史末位
        setHistory((prev) => {
          const updated: Record<string, number[]> = {};
          for (const sp of spec.species) {
            const arr = prev[sp.id] ? [...prev[sp.id]] : [];
            if (updates[sp.id] !== undefined && arr.length > 0) {
              arr[arr.length - 1] = updates[sp.id];
            }
            updated[sp.id] = arr;
          }
          return updated;
        });
      }

      return { applied, clamped, unknownSpecies };
    },
    [spec],
  );

  const applyParams = useCallback(
    (newParams: EcoParams) => {
      clearTimer();
      setParams({ ...newParams });
      const pops0 = initialPopulations(spec, newParams);
      setPopulations(pops0);
      setCurrentTime(0.0);
      setHistory(initialHistory(spec, pops0));
      setTimeData([0]);
      setSimulationRunning(false);
      setSimulationActive(false);
    },
    [clearTimer, spec],
  );

  const getSnapshot = useCallback(() => {
    return {
      populations,
      currentTime,
      simulationRunning,
      simulationActive,
    };
  }, [populations, currentTime, simulationRunning, simulationActive]);

  // 切换 spec 时整体重置
  useEffect(() => {
    setParams({ ...spec.params });
    const pops0 = initialPopulations(spec, spec.params);
    setPopulations(pops0);
    setCurrentTime(0.0);
    setHistory(initialHistory(spec, pops0));
    setTimeData([0]);
    clearTimer();
    setSimulationRunning(false);
    setSimulationActive(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.id]);

  // 卸载清理
  useEffect(() => clearTimer, [clearTimer]);

  return useMemo(
    () => ({
      spec,
      params,
      populations,
      currentTime,
      history,
      timeData,
      simulationRunning,
      simulationActive,
      stepSimulation,
      startSimulation,
      pauseSimulation,
      resumeSimulation,
      fullReset,
      applyDisturbance,
      setPopulation,
      applyParams,
      getSnapshot,
    }),
    [
      spec,
      params,
      populations,
      currentTime,
      history,
      timeData,
      simulationRunning,
      simulationActive,
      stepSimulation,
      startSimulation,
      pauseSimulation,
      resumeSimulation,
      fullReset,
      applyDisturbance,
      setPopulation,
      applyParams,
      getSnapshot,
    ],
  );
}
