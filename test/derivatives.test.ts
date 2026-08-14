import { describe, it, expect } from "vitest";
import { derivatives } from "../src/eco/derivatives";
import { computeStep } from "../src/eco/computeStep";
import type { SpeciesDef, RelationDef, EcoModelSpec } from "../src/eco/types";

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

function makeSpec(species: SpeciesDef[], relations: RelationDef[]): EcoModelSpec {
  return {
    id: "test",
    name: "测试",
    description: "",
    species,
    relations,
    params: { dt: 0.045 },
    paramMeta: {},
    dt: 0.045,
    axisRanges: {
      left: { min: 0, max: 100, step: 10, title: "左", color: "#000" },
      right: { min: 0, max: 100, step: 10, title: "右", color: "#000" },
    },
  };
}

describe("derivatives", () => {
  it("返回与 computeStep(dt=1, skipClamp) 一致的导数", () => {
    const species = [
      makeSpecies({ id: "plant", name: "草", hasLogistic: true, growthRate: "plant_r", carryingCapacity: "plant_K", initial: 100 }),
      makeSpecies({ id: "hare", name: "兔", hasLogistic: false, initial: 50 }),
      makeSpecies({ id: "wolf", name: "狼", hasLogistic: false, initial: 20 }),
    ];
    const relations: RelationDef[] = [
      { type: "predation", prey: "plant", predator: "hare", predationRate: "plant_hare_a", conversionEfficiency: "plant_hare_e" },
      { type: "predation", prey: "hare", predator: "wolf", predationRate: "hare_wolf_a", conversionEfficiency: "hare_wolf_e", predatorDeathRate: "hare_wolf_m" },
    ];
    const spec = makeSpec(species, relations);
    const params = {
      plant_r: 0.3, plant_K: 200,
      plant_hare_a: 0.008, plant_hare_e: 0.68,
      hare_wolf_a: 0.01, hare_wolf_e: 0.68, hare_wolf_m: 0.08,
    };
    const pops = { plant: 100, hare: 50, wolf: 20 };
    const d = derivatives(spec, params, pops);
    // 与 computeStep(dt=1, skipClamp=true) 的结果一致（next - current = d）
    const next = computeStep(species, relations, params, pops, 1, { skipClamp: true });
    for (const id of ["plant", "hare", "wolf"]) {
      expect(d[id]).toBeCloseTo((next[id] ?? 0) - pops[id], 10);
    }
  });

  it("捕食关系：猎物导数负、捕食者导数正", () => {
    const species = [
      makeSpecies({ id: "plant", name: "草", hasLogistic: true, growthRate: "r", carryingCapacity: "K", initial: 100 }),
      makeSpecies({ id: "hare", name: "兔", hasLogistic: false, initial: 50 }),
    ];
    const relations: RelationDef[] = [
      { type: "predation", prey: "plant", predator: "hare", predationRate: "a", conversionEfficiency: "e" },
    ];
    const spec = makeSpec(species, relations);
    const params = { r: 0.3, K: 200, a: 0.01, e: 0.5 };
    const d = derivatives(spec, params, { plant: 100, hare: 50 });
    expect(d.hare).toBeGreaterThan(0); // 捕食者增长
    // 猎物净变化可能正（logistic 增长占优）也可能负，但捕食项必然负贡献
    // 验证：无 logistic 时猎物导数应为负
    const d2 = derivatives(spec, params, { plant: 5, hare: 100 });
    expect(d2.plant).toBeLessThan(0); // 猎物很少时被吃光
  });

  it("竞争关系：双方都受抑制", () => {
    const species = [
      makeSpecies({ id: "a", name: "甲", hasLogistic: true, growthRate: "r1", carryingCapacity: "K1", initial: 50 }),
      makeSpecies({ id: "b", name: "乙", hasLogistic: true, growthRate: "r2", carryingCapacity: "K2", initial: 50 }),
    ];
    const relations: RelationDef[] = [
      { type: "competition", species1: "a", species2: "b", coeff1: "c1", coeff2: "c2" },
    ];
    const spec = makeSpec(species, relations);
    const params = { r1: 0.3, K1: 100, r2: 0.3, K2: 100, c1: 0.02, c2: 0.02 };
    // 高密度下竞争项显著，导数低于无竞争时
    const d = derivatives(spec, params, { a: 90, b: 90 });
    // 无竞争对照
    const d0 = derivatives(makeSpec(species, []), params, { a: 90, b: 90 });
    expect(d.a).toBeLessThan(d0.a);
    expect(d.b).toBeLessThan(d0.b);
  });
});
