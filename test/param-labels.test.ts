// 参数标签双语测试（BILINGUAL L1）：
// 验证 builderTools 生成的 paramMeta 携带 label_en，且英文标签含物种英文名；
// speciesNamesEn 缺省时英文标签退化为中文名（数据层面无英文名可用）。
// 背景：修复前英文界面在构建参数区暴露中文标签（如「dt (积分步长)」）。
import { describe, it, expect } from "vitest";
import { inferDefaultParams, addRelationParams } from "../src/tools/builderTools";
import type { SpeciesDef, RelationDef } from "../src/eco/types";

function logisticSpecies(overrides: Partial<SpeciesDef> = {}): SpeciesDef {
  return {
    id: "plant",
    name: "植物",
    name_en: "Plant",
    color: "#2e7d32",
    axis: "left",
    minValue: 2,
    initial: 150,
    hasLogistic: true,
    growthRate: "r_plant",
    carryingCapacity: "K_plant",
    ...overrides,
  };
}

describe("inferDefaultParams 的 label_en", () => {
  it("logistic 物种：增长率/容纳量/初始值/dt 均带 label_en 且含英文种名", () => {
    const { paramMeta } = inferDefaultParams([logisticSpecies()]);

    expect(paramMeta.r_plant.label_en).toBe("r_plant (Plant growth rate)");
    expect(paramMeta.K_plant.label_en).toBe("K_plant (Plant carrying capacity)");
    // 初始值键为 id 首字母大写 + "0"
    expect(paramMeta.Plant0.label_en).toBe("Plant0 (Plant initial)");
    expect(paramMeta.dt.label_en).toBe("dt (Integration step)");
  });

  it("deathRate 物种：死亡率带 label_en", () => {
    const sp = logisticSpecies({
      id: "hare",
      name: "雪兔",
      name_en: "Hare",
      deathRate: "d_hare",
    });
    const { paramMeta } = inferDefaultParams([sp]);
    expect(paramMeta.d_hare.label_en).toBe("d_hare (Hare death rate)");
  });

  it("物种无英文名时：label_en 退化为中文名", () => {
    const sp = logisticSpecies({ name_en: undefined });
    const { paramMeta } = inferDefaultParams([sp]);
    expect(paramMeta.r_plant.label_en).toBe("r_plant (植物 growth rate)");
  });

  it("中文字段 label 保持不变（zh 界面仍显示中文）", () => {
    const { paramMeta } = inferDefaultParams([logisticSpecies()]);
    expect(paramMeta.r_plant.label).toBe("r_plant (植物增长率)");
  });
});

describe("addRelationParams 的 label_en", () => {
  const speciesNames = { hare: "雪兔", lynx: "猞猁" };
  const speciesNamesEn = { hare: "Hare", lynx: "Lynx" };

  it("捕食关系：捕食率/转化率/顶级捕食者死亡率均带英文标签", () => {
    const relation: RelationDef = { type: "predation", prey: "hare", predator: "lynx" };
    const params: Record<string, number> = {};
    const paramMeta: Record<string, any> = {};
    addRelationParams(
      relation,
      params,
      paramMeta,
      speciesNames,
      [], // 无其他关系 → lynx 为顶级捕食者，生成 _m
      [],
      speciesNamesEn,
    );

    expect(paramMeta[relation.predationRate!].label_en).toBe("Lynx→Hare predation rate");
    expect(paramMeta[relation.conversionEfficiency!].label_en).toBe("Hare→Lynx conversion");
    expect(paramMeta["lynx_m"].label_en).toBe("Lynx mortality");
  });

  it("不传 speciesNamesEn 时：英文标签退化为中文名", () => {
    const relation: RelationDef = { type: "predation", prey: "hare", predator: "lynx" };
    const params: Record<string, number> = {};
    const paramMeta: Record<string, any> = {};
    addRelationParams(relation, params, paramMeta, speciesNames, [], []);

    expect(paramMeta[relation.predationRate!].label_en).toBe("猞猁→雪兔 predation rate");
  });

  it("竞争关系：两个竞争系数均带英文标签", () => {
    const relation: RelationDef = { type: "competition", species1: "hare", species2: "lynx" };
    const params: Record<string, number> = {};
    const paramMeta: Record<string, any> = {};
    addRelationParams(relation, params, paramMeta, speciesNames, [], [], speciesNamesEn);

    expect(paramMeta[relation.coeff1!].label_en).toBe("Hare competition coeff.");
    expect(paramMeta[relation.coeff2!].label_en).toBe("Lynx competition coeff.");
  });

  it("互利关系：两个互利系数均带英文标签", () => {
    const relation: RelationDef = { type: "mutualism", species1: "hare", species2: "lynx" };
    const params: Record<string, number> = {};
    const paramMeta: Record<string, any> = {};
    addRelationParams(relation, params, paramMeta, speciesNames, [], [], speciesNamesEn);

    expect(paramMeta[relation.coeff1!].label_en).toBe("Hare mutualism coeff.");
    expect(paramMeta[relation.coeff2!].label_en).toBe("Lynx mutualism coeff.");
  });
});
