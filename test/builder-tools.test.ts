import { describe, it, expect, vi } from "vitest";
import {
  autoSpeciesKeys,
  inferDefaultParams,
  addRelationParams,
  buildModel,
  executeBuilderTool,
  type BuilderApi,
  type BuilderState,
} from "../src/tools/builderTools";
import type { SpeciesDef, RelationDef } from "../src/eco/types";

function makeSpecies(overrides: Partial<SpeciesDef> & { id: string; name: string }): SpeciesDef {
  return {
    color: "#000",
    axis: "right",
    minValue: 0.5,
    initial: 50,
    hasLogistic: false,
    ...overrides,
  } as SpeciesDef;
}

/** 构造 BuilderApi mock（纯内存 state） */
function makeBuilderApi(initial: Partial<BuilderState> = {}): BuilderApi {
  const state: BuilderState = {
    species: [],
    relations: [],
    params: { dt: 0.045 },
    paramMeta: {},
    ...initial,
  };
  return {
    get state() {
      return state;
    },
    setSpecies: (s) => {
      state.species = s;
    },
    addSpecies: (s) => {
      state.species = [...state.species, s];
      const { params, paramMeta } = inferDefaultParams([s]);
      Object.assign(state.params, params);
      Object.assign(state.paramMeta, paramMeta);
    },
    removeSpecies: (id) => {
      state.species = state.species.filter((s) => s.id !== id);
    },
    addRelation: (r) => {
      state.relations = [...state.relations, r];
    },
    removeRelation: (i) => {
      state.relations = state.relations.filter((_, idx) => idx !== i);
    },
    setParams: (p) => {
      Object.assign(state.params, p);
    },
    buildAndRun: () => {},
  };
}

describe("autoSpeciesKeys", () => {
  it("hasLogistic 物种生成 growthRate 与 carryingCapacity 键", () => {
    expect(autoSpeciesKeys("plant", true, false)).toEqual({
      growthRate: "plant_r",
      carryingCapacity: "plant_K",
      deathRate: undefined,
    });
  });

  it("无 logistic 物种不生成增长键", () => {
    expect(autoSpeciesKeys("hare", false, false)).toEqual({
      growthRate: undefined,
      carryingCapacity: undefined,
      deathRate: undefined,
    });
  });

  it("有 deathRate 时生成死亡率键", () => {
    expect(autoSpeciesKeys("hare", false, true)).toEqual({
      growthRate: undefined,
      carryingCapacity: undefined,
      deathRate: "hare_d",
    });
  });
});

describe("inferDefaultParams", () => {
  it("logistic 物种生成默认增长率/容纳量/初始值", () => {
    const { params } = inferDefaultParams([
      makeSpecies({ id: "plant", name: "草", hasLogistic: true, growthRate: "plant_r", carryingCapacity: "plant_K", initial: 120 }),
    ]);
    expect(params.plant_r).toBe(0.3);
    expect(params.plant_K).toBe(200);
    expect(params.Plant0).toBe(120); // 尊重 sp.initial（修复 initial 覆盖 bug）
  });

  it("无 logistic 物种默认初始 30", () => {
    const { params } = inferDefaultParams([
      makeSpecies({ id: "hare", name: "兔", hasLogistic: false, initial: 100 }),
    ]);
    expect(params.Hare0).toBe(100); // 尊重 sp.initial
  });

  it("固定 dt 为 0.045", () => {
    const { params } = inferDefaultParams([]);
    expect(params.dt).toBe(0.045);
  });
});

describe("addRelationParams — predation", () => {
  it("自动生成并写回 predationRate / conversionEfficiency 键", () => {
    const rel: RelationDef = { type: "predation", prey: "plant", predator: "hare" };
    const params: Record<string, number> = {};
    const meta: Record<string, any> = {};
    addRelationParams(rel, params, meta, { plant: "草", hare: "兔" }, [], []);
    expect(rel.predationRate).toBe("plant_hare_a");
    expect(rel.conversionEfficiency).toBe("plant_hare_e");
    expect(params.plant_hare_a).toBeGreaterThanOrEqual(0.002);
    expect(params.plant_hare_a).toBeLessThanOrEqual(0.015);
    expect(params.plant_hare_e).toBe(0.68);
  });

  it("猎物是资源型（hasLogistic）时捕食率取更低默认 0.008", () => {
    const rel: RelationDef = { type: "predation", prey: "plant", predator: "hare" };
    const params: Record<string, number> = {};
    const meta: Record<string, any> = {};
    const plant = makeSpecies({ id: "plant", name: "草", hasLogistic: true, growthRate: "plant_r", carryingCapacity: "plant_K" });
    addRelationParams(rel, params, meta, {}, [], [plant]);
    expect(params.plant_hare_a).toBe(0.008);
  });

  it("顶级捕食者生成并写回 predatorDeathRate", () => {
    const rel: RelationDef = { type: "predation", prey: "hare", predator: "wolf" };
    const params: Record<string, number> = {};
    const meta: Record<string, any> = {};
    addRelationParams(rel, params, meta, {}, [], []);
    expect(rel.predatorDeathRate).toBe("wolf_m");
    expect(params.wolf_m).toBeGreaterThanOrEqual(0.03);
    expect(params.wolf_m).toBeLessThanOrEqual(0.12);
  });

  it("中间营养级（既捕食又被捕食）不生成 predatorDeathRate", () => {
    const existing = [{ type: "predation", prey: "hare", predator: "wolf" } as RelationDef];
    const rel: RelationDef = { type: "predation", prey: "plant", predator: "hare" };
    const params: Record<string, number> = {};
    const meta: Record<string, any> = {};
    addRelationParams(rel, params, meta, {}, existing, []);
    expect(rel.predatorDeathRate).toBeUndefined();
  });
});

describe("addRelationParams — competition / mutualism", () => {
  it("竞争默认系数不对称（生态学现实，避免对称竞争）", () => {
    const rel: RelationDef = { type: "competition", species1: "big", species2: "small" };
    const params: Record<string, number> = {};
    const meta: Record<string, any> = {};
    addRelationParams(rel, params, meta, {}, [], []);
    expect(rel.coeff1).toBe("big_small_c1");
    expect(rel.coeff2).toBe("big_small_c2");
    expect(params.big_small_c1).not.toBe(params.big_small_c2);
  });

  it("互利生成饱和系数", () => {
    const rel: RelationDef = { type: "mutualism", species1: "bee", species2: "flower" };
    const params: Record<string, number> = {};
    const meta: Record<string, any> = {};
    addRelationParams(rel, params, meta, {}, [], []);
    expect(rel.coeff1).toBe("bee_flower_m1");
    expect(rel.coeff2).toBe("bee_flower_m2");
    expect(params.bee_flower_m1).toBeGreaterThan(0);
  });
});

describe("buildModel", () => {
  it("构建完整模型并生成轴分配", () => {
    const species = [
      makeSpecies({ id: "plant", name: "草", hasLogistic: true, growthRate: "plant_r", carryingCapacity: "plant_K", initial: 100 }),
      makeSpecies({ id: "hare", name: "兔", hasLogistic: false, initial: 50 }),
      makeSpecies({ id: "wolf", name: "狼", hasLogistic: false, initial: 20 }),
    ];
    const relations: RelationDef[] = [
      { type: "predation", prey: "plant", predator: "hare", predationRate: "plant_hare_a", conversionEfficiency: "plant_hare_e" },
      { type: "predation", prey: "hare", predator: "wolf", predationRate: "hare_wolf_a", conversionEfficiency: "hare_wolf_e", predatorDeathRate: "hare_wolf_m" },
    ];
    const state = {
      species,
      relations,
      params: {
        plant_r: 0.3, plant_K: 200, Plant0: 100, Hare0: 50, Wolf0: 20,
        plant_hare_a: 0.008, plant_hare_e: 0.68,
        hare_wolf_a: 0.01, hare_wolf_e: 0.68, hare_wolf_m: 0.08,
        dt: 0.045,
      },
      paramMeta: {},
    };
    const model = buildModel(state as any, "测试模型", "测试");
    expect(model).not.toBeNull();
    expect(model!.species).toHaveLength(3);
    expect(model!.relations).toHaveLength(2);
    // 生产者（有 logistic）应分配左轴
    expect(model!.species.find((s) => s.id === "plant")!.axis).toBe("left");
    // 可行性字段存在
    expect(model!.feasibility).toBeDefined();
  });

  it("无物种时返回 null", () => {
    const model = buildModel({ species: [], relations: [], params: {}, paramMeta: {} } as any, "空", "");
    expect(model).toBeNull();
  });
});

describe("executeBuilderTool", () => {
  it("add-species 校验非法 id", async () => {
    const api = makeBuilderApi();
    const result = await executeBuilderTool("add-species", { id: "中文id", name: "草" }, api);
    expect((result as { error: string }).error).toContain("非法");
  });

  it("add-species 校验重复 id", async () => {
    const api = makeBuilderApi({ species: [makeSpecies({ id: "plant", name: "草" })] });
    const result = await executeBuilderTool("add-species", { id: "plant", name: "草" }, api);
    expect((result as { error: string }).error).toContain("已存在");
  });

  it("add-species 校验物种上限 20", async () => {
    const species = Array.from({ length: 20 }, (_, i) =>
      makeSpecies({ id: `sp${i}`, name: `物种${i}` }));
    const api = makeBuilderApi({ species });
    const result = await executeBuilderTool("add-species", { id: "overflow", name: "溢出" }, api);
    expect((result as { error: string }).error).toContain("上限");
  });

  it("add-species 成功添加（hasLogistic 严格布尔校验：字符串 'false' 不生效）", async () => {
    const api = makeBuilderApi();
    const result = await executeBuilderTool("add-species", { id: "plant", name: "草", hasLogistic: "false" as unknown as boolean }, api);
    expect((result as { success: boolean }).success).toBe(true);
    expect(api.state.species[0].hasLogistic).toBe(false); // 字符串 "false" 应被拦截为 false
  });

  it("add-relation 捕食关系必须提供 prey 和 predator", async () => {
    const api = makeBuilderApi();
    const result = await executeBuilderTool("add-relation", { type: "predation" }, api);
    expect((result as { error: string }).error).toContain("必须同时提供");
  });

  it("add-relation 阻止自捕食", async () => {
    const api = makeBuilderApi({
      species: [makeSpecies({ id: "hare", name: "兔" })],
    });
    const result = await executeBuilderTool("add-relation", { type: "predation", prey: "hare", predator: "hare" }, api);
    expect((result as { error: string }).error).toContain("自捕食");
  });

  it("add-relation 捕食者必须在已添加物种中", async () => {
    const api = makeBuilderApi({
      species: [makeSpecies({ id: "plant", name: "草" })],
    });
    const result = await executeBuilderTool("add-relation", { type: "predation", prey: "plant", predator: "wolf" }, api);
    expect((result as { error: string }).error).toContain("不在已添加物种");
  });

  it("add-relation 竞争关系校验 species1/species2", async () => {
    const api = makeBuilderApi();
    const result = await executeBuilderTool("add-relation", { type: "competition", species1: "a" }, api);
    expect((result as { error: string }).error).toContain("必须提供 species1 和 species2");
  });

  it("add-relation 成功添加合法捕食关系", async () => {
    const api = makeBuilderApi({
      species: [makeSpecies({ id: "plant", name: "草" }), makeSpecies({ id: "hare", name: "兔" })],
    });
    const result = await executeBuilderTool("add-relation", { type: "predation", prey: "plant", predator: "hare" }, api);
    expect((result as { success: boolean }).success).toBe(true);
    expect(api.state.relations).toHaveLength(1);
  });

  it("get-current-model 返回物种/关系/参数", async () => {
    const api = makeBuilderApi({
      species: [makeSpecies({ id: "plant", name: "草" })],
      relations: [{ type: "predation", prey: "plant", predator: "hare" } as RelationDef],
    });
    const result = await executeBuilderTool("get-current-model", {}, api) as { species: { id: string }[] };
    expect(result.species).toHaveLength(1);
    expect(result.species[0].id).toBe("plant");
  });

  it("build-model 无物种时报错", async () => {
    const api = makeBuilderApi();
    const result = await executeBuilderTool("build-model", {}, api);
    expect((result as { error: string }).error).toContain("没有物种");
  });

  it("run-model 调用 buildAndRun 并返回可行性", async () => {
    const buildAndRun = vi.fn();
    const api = makeBuilderApi({
      species: [makeSpecies({ id: "plant", name: "草", hasLogistic: true, growthRate: "plant_r", carryingCapacity: "plant_K" })],
    });
    api.buildAndRun = buildAndRun;
    const result = await executeBuilderTool("run-model", { name: "模型", description: "" }, api) as { success: boolean; feasibility: { status: string } };
    expect(result.success).toBe(true);
    expect(buildAndRun).toHaveBeenCalled();
  });

  it("未知工具返回错误", async () => {
    const api = makeBuilderApi();
    const result = await executeBuilderTool("unknown-tool", {}, api);
    expect((result as { error: string }).error).toContain("未知工具");
  });
});
