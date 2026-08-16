// displayName 数据层双语回退逻辑测试（BILINGUAL-PLAN L1）
import { describe, it, expect } from "vitest";
import { displayName } from "../src/eco/i18n";

describe("displayName", () => {
  it("中文界面始终用中文原文", () => {
    expect(displayName("植物种群", "Plant population", "zh")).toBe("植物种群");
  });

  it("英文界面且有 en 值时用英文", () => {
    expect(displayName("植物种群", "Plant population", "en")).toBe("Plant population");
  });

  it("英文界面但无 en 值时回退中文原文（动态构建模型场景）", () => {
    expect(displayName("自定义物种", undefined, "en")).toBe("自定义物种");
  });

  it("en 为空字符串时回退中文", () => {
    expect(displayName("植物", "", "en")).toBe("植物");
  });
});
