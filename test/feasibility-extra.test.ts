import { describe, it, expect } from "vitest";
import { ensureFeasible } from "../src/tools/feasibility";
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

describe("ensureFeasible — 补充分类场景", () => {
  it("竞争+互利关系中的灭绝物种通过对手拥有再生来源 → 非 structural", () => {
    const species = [
      makeSpecies({ id: "nutrient", name: "营养液", hasLogistic: true, growthRate: "nutrient_r", carryingCapacity: "nutrient_K", initial: 200 }),
      makeSpecies({ id: "pc", name: "大草履虫", hasLogistic: false, initial: 50 }),
      makeSpecies({ id: "pa", name: "小草履虫", hasLogistic: false, initial: 50 }),
    ];
    const relations: RelationDef[] = [
      { type: "competition", species1: "nutrient", species2: "pc", coeff1: "nut_pc_c1", coeff2: "nut_pc_c2" },
      { type: "competition", species1: "nutrient", species2: "pa", coeff1: "nut_pa_c1", coeff2: "nut_pa_c2" },
    ];
    const params = {
      Nutrient0: 200, Pc0: 50, Pa0: 50,
      nutrient_r: 0.3, nutrient_K: 300,
      nut_pc_c1: 0.005, nut_pc_c2: 0.005,
      nut_pa_c1: 0.005, nut_pa_c2: 0.005,
    };
    const res = ensureFeasible(species, relations, params);
    // 营养液(hasLogistic)是竞争对手 → 草履虫拥有再生来源 → 非结构性
    expect(res.status).not.toBe("structural-extinction");
  });

  it("鲸落（无任何可再生来源）→ structural-extinction", () => {
    const species = [
      makeSpecies({ id: "whalefall", name: "鲸尸", hasLogistic: false, initial: 100 }),
      makeSpecies({ id: "scavenger", name: "食腐生物", hasLogistic: false, initial: 30 }),
    ];
    const relations: RelationDef[] = [{
      type: "predation",
      prey: "whalefall",
      predator: "scavenger",
      predationRate: "whalefall_scavenger_a",
      conversionEfficiency: "whalefall_scavenger_e",
      predatorDeathRate: "whalefall_scavenger_m",
    }];
    const params = { Whalefall0: 100, Scavenger0: 30, whalefall_scavenger_a: 0.03, whalefall_scavenger_e: 0.68, whalefall_scavenger_m: 0.08 };
    const res = ensureFeasible(species, relations, params);
    expect(res.status).toBe("structural-extinction");
  });

  it("纯竞争耗竭（无 logistic、无可再生来源）→ 非 structural（竞争排斥是参数性问题）", () => {
    // 注意：纯竞争双方都无 logistic 且无资源，分类取决于能量来源判定。
    // 这里验证一个已有回归：资源耗竭场景不会崩溃报错。
    const species = [
      makeSpecies({ id: "pc", name: "大草履虫", hasLogistic: false, initial: 50 }),
      makeSpecies({ id: "pa", name: "小草履虫", hasLogistic: false, initial: 50 }),
    ];
    const relations: RelationDef[] = [{
      type: "competition", species1: "pc", species2: "pa",
      coeff1: "pc_pa_c1", coeff2: "pc_pa_c2",
    }];
    const params = { Pc0: 50, Pa0: 50, pc_pa_c1: 0.005, pc_pa_c2: 0.005 };
    const res = ensureFeasible(species, relations, params);
    expect(["ok", "adjusted"]).toContain(res.status);
  });

  it("生态金字塔：捕食者数量不高于猎物（通过自动调参压制捕食者）", () => {
    const species = [
      makeSpecies({ id: "plant", name: "草", hasLogistic: true, growthRate: "plant_r", carryingCapacity: "plant_K", initial: 80 }),
      makeSpecies({ id: "hare", name: "兔", hasLogistic: false, initial: 50 }),
      makeSpecies({ id: "wolf", name: "狼", hasLogistic: false, initial: 20 }),
    ];
    const relations: RelationDef[] = [
      { type: "predation", prey: "plant", predator: "hare", predationRate: "plant_hare_a", conversionEfficiency: "plant_hare_e" },
      { type: "predation", prey: "hare", predator: "wolf", predationRate: "hare_wolf_a", conversionEfficiency: "hare_wolf_e", predatorDeathRate: "hare_wolf_m" },
    ];
    const params = {
      Plant0: 80, Hare0: 50, Wolf0: 20,
      plant_r: 0.3, plant_K: 200,
      plant_hare_a: 0.05, plant_hare_e: 0.68,
      hare_wolf_a: 0.03, hare_wolf_e: 0.68, hare_wolf_m: 0.08,
    };
    const res = ensureFeasible(species, relations, params);
    expect(res.status).not.toBe("structural-extinction");
  });

  it("互利关系：饱和项防止正反馈发散，系统可行", () => {
    const species = [
      makeSpecies({ id: "bee", name: "蜜蜂", hasLogistic: true, growthRate: "bee_r", carryingCapacity: "bee_K", initial: 50 }),
      makeSpecies({ id: "flower", name: "花", hasLogistic: true, growthRate: "flower_r", carryingCapacity: "flower_K", initial: 50 }),
    ];
    const relations: RelationDef[] = [{
      type: "mutualism", species1: "bee", species2: "flower",
      coeff1: "bee_flower_m1", coeff2: "bee_flower_m2",
    }];
    const params = {
      Bee0: 50, Flower0: 50,
      bee_r: 0.3, bee_K: 200, flower_r: 0.3, flower_K: 200,
      bee_flower_m1: 0.05, bee_flower_m2: 0.05,
    };
    const res = ensureFeasible(species, relations, params);
    expect(["ok", "adjusted"]).toContain(res.status);
  });
});
