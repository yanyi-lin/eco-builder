import { describe, it, expect, vi } from "vitest";
import {
  readAnimalData,
  animalPopulationSet,
  startSim,
  pauseSim,
  restartSim,
  executeTool,
  type EcoApi,
} from "../src/tools/ecoTools";
import type { EcoModelSpec, SpeciesDef } from "../src/eco/types";

// 构造最小 EcoApi mock
function makeApi(overrides: Partial<EcoApi> = {}): EcoApi {
  return {
    spec: {
      id: "test",
      name: "测试模型",
      description: "",
      species: [
        { id: "hare", name: "兔", color: "#000", axis: "right", minValue: 0.5, initial: 50, hasLogistic: false } as SpeciesDef,
      ],
      relations: [],
      params: { dt: 0.045 },
      paramMeta: {},
      dt: 0.045,
    } as EcoModelSpec,
    populations: { hare: 50 },
    currentTime: 0,
    simulationRunning: false,
    simulationActive: false,
    hasRead: { current: false },
    setPopulation: vi.fn(),
    startSimulation: vi.fn(),
    pauseSimulation: vi.fn(),
    fullReset: vi.fn(),
    ...overrides,
  };
}

describe("readAnimalData", () => {
  it("返回种群快照并标记 hasRead", () => {
    const api = makeApi();
    const result = readAnimalData(api);
    expect(api.hasRead.current).toBe(true);
    expect(result.species).toHaveLength(1);
    expect(result.species[0].value).toBe(50);
  });

  it("包含模型元信息与运行状态", () => {
    const api = makeApi({ simulationRunning: true, simulationActive: true, currentTime: 3.2 });
    const result = readAnimalData(api);
    expect(result.model.name).toBe("测试模型");
    expect(result.simulationRunning).toBe(true);
    expect(result.currentTime).toBe(3.2);
  });
});

describe("animalPopulationSet", () => {
  it("未先 read 时返回错误（必须先读约束）", () => {
    const api = makeApi();
    const result = animalPopulationSet(api, { hare: 30 });
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toContain("必须先调用");
    expect(api.setPopulation).not.toHaveBeenCalled();
  });

  it("read 后允许设置并调用 setPopulation", () => {
    const api = makeApi({ hasRead: { current: true } });
    (api.setPopulation as ReturnType<typeof vi.fn>).mockReturnValue({ applied: { hare: 30 }, clamped: [], unknownSpecies: [] });
    const result = animalPopulationSet(api, { hare: 30 });
    expect(api.setPopulation).toHaveBeenCalledWith({ hare: 30 });
    expect("applied" in result).toBe(true);
  });
});

describe("control tools", () => {
  it("startSim 调用 startSimulation", () => {
    const api = makeApi();
    const result = startSim(api);
    expect(api.startSimulation).toHaveBeenCalled();
    expect(result.simulationRunning).toBe(true);
  });

  it("pauseSim 调用 pauseSimulation", () => {
    const api = makeApi();
    const result = pauseSim(api);
    expect(api.pauseSimulation).toHaveBeenCalled();
    expect(result.simulationRunning).toBe(false);
  });

  it("restartSim 调用 fullReset", () => {
    const api = makeApi();
    restartSim(api);
    expect(api.fullReset).toHaveBeenCalled();
  });
});

describe("executeTool", () => {
  it("分发 read-animal-data", () => {
    const api = makeApi();
    const result = executeTool("read-animal-data", {}, api) as { species: unknown[] };
    expect(result.species).toHaveLength(1);
  });

  it("未知工具返回错误", () => {
    const api = makeApi();
    const result = executeTool("unknown-tool", {}, api) as { error: string };
    expect(result.error).toContain("未知工具");
  });

  it("分发 start", () => {
    const api = makeApi();
    executeTool("start", {}, api);
    expect(api.startSimulation).toHaveBeenCalled();
  });

  it("分发 restart", () => {
    const api = makeApi();
    executeTool("restart", {}, api);
    expect(api.fullReset).toHaveBeenCalled();
  });
});
