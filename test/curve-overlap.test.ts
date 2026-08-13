import { describe, it, expect } from "vitest";
import { detectCurveOverlap } from "../src/tools/feasibility";
import type { SpeciesDef, RelationDef } from "../src/eco/types";

// 构造 SpeciesDef（补充必填字段）
function S(id: string, hasLogistic: boolean, initial: number): SpeciesDef {
  return {
    id,
    name: id,
    color: "#000",
    axis: "right",
    minValue: 0.5,
    initial,
    hasLogistic,
    ...(hasLogistic ? { growthRate: `${id}_r`, carryingCapacity: `${id}_K` } : {}),
  } as SpeciesDef;
}

const COMPETITION = (a: string, b: string, c1: string, c2: string): RelationDef => ({
  type: "competition",
  species1: a,
  species2: b,
  coeff1: c1,
  coeff2: c2,
});

describe("detectCurveOverlap（曲线不可区分度）", () => {
  it("对称竞争（同参数同初值，全程重合）→ coincident=true", () => {
    const species = [S("a", true, 50), S("b", true, 50)];
    const params = {
      A0: 50, B0: 50,
      a_r: 0.3, a_K: 200, b_r: 0.3, b_K: 200,
      a_b_c1: 0.005, a_b_c2: 0.005,
    };
    const res = detectCurveOverlap(species, [COMPETITION("a", "b", "a_b_c1", "a_b_c2")], params);
    expect(res).toHaveLength(1);
    expect(res[0].coincident).toBe(true);
  });

  it("对称竞争（极小系数共存、稳定期完全重回）→ coincident=true", () => {
    const species = [S("a", true, 120), S("b", true, 80)];
    const params = {
      A0: 120, B0: 80,
      a_r: 0.3, a_K: 200, b_r: 0.3, b_K: 200,
      a_b_c1: 0.0005, a_b_c2: 0.0005,
    };
    const res = detectCurveOverlap(species, [COMPETITION("a", "b", "a_b_c1", "a_b_c2")], params);
    expect(res[0].coincident).toBe(true);
  });

  it("不对称竞争（一方明显占优）→ 不判 coincident", () => {
    const species = [S("a", true, 50), S("b", true, 50)];
    const params = {
      A0: 50, B0: 50,
      a_r: 0.3, a_K: 200, b_r: 0.3, b_K: 200,
      a_b_c1: 0.015, a_b_c2: 0.001,
    };
    const res = detectCurveOverlap(species, [COMPETITION("a", "b", "a_b_c1", "a_b_c2")], params);
    expect(res[0].coincident).toBe(false);
  });

  it("Gause 对称崩溃（无 logistic、同步归零贴地）→ 豁免（接近灭绝）", () => {
    const species = [S("a", false, 50), S("b", false, 50)];
    const params = { A0: 50, B0: 50, a_b_c1: 0.005, a_b_c2: 0.005 };
    const res = detectCurveOverlap(species, [COMPETITION("a", "b", "a_b_c1", "a_b_c2")], params);
    expect(res[0].coincident).toBe(false);
    expect(res[0].reason).toContain("接近灭绝");
  });

  it("双方都贴地（鲸落收尾最终态）→ 豁免", () => {
    const species = [S("a", false, 50), S("b", false, 50)];
    // 稳定期均值贴地（≈minValue），曲线重合但濒死
    const params = { A0: 50, B0: 50, a_b_c1: 0.005, a_b_c2: 0.005 };
    const res = detectCurveOverlap(species, [COMPETITION("a", "b", "a_b_c1", "a_b_c2")], params);
    expect(res[0].coincident).toBe(false);
  });

  it("捕食关系不被纳入竞争曲线检测", () => {
    const species = [S("whale", false, 300), S("hagfish", false, 50)];
    const rel: RelationDef = {
      type: "predation",
      prey: "whale",
      predator: "hagfish",
      predationRate: "whale_hagfish_a",
      conversionEfficiency: "whale_hagfish_e",
    };
    const params = { Whale0: 300, Hagfish0: 50, whale_hagfish_a: 0.01, whale_hagfish_e: 0.68, hagfish_m: 0.08 };
    const res = detectCurveOverlap(species, [rel], params);
    expect(res).toHaveLength(0);
  });
});
