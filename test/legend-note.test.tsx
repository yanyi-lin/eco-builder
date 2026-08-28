// @vitest-environment jsdom
// 图例组件测试（原 legend-note.test.tsx；说明句 legend.note 已按需求移除，
// 相关模板/回退文案测试随之删除，文件保留图例交互与可访问性断言）：
// - 图例项为 button（键盘可操作）、aria-pressed 表达隐藏态、title 提供完整名
// - chips 渲染：色点、实时数量、轴徽章（多物种 stacked 模式见组件内注释）
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { LanguageProvider } from "../src/i18n/LanguageProvider";
import { CustomLegend } from "../src/components/CustomLegend";
import { getModel, DEFAULT_MODEL_ID } from "../src/eco/models";
import type { EcoModelSpec } from "../src/eco/types";

const STORAGE_KEY = "eco-builder-lang";

function renderLegend(spec: EcoModelSpec, onToggle = () => {}) {
  return render(
    <LanguageProvider>
      <CustomLegend spec={spec} hiddenStates={[false, false, false]} onToggle={onToggle} />
    </LanguageProvider>,
  );
}

describe("CustomLegend 图例项交互与可访问性", () => {
  beforeEach(() => localStorage.setItem(STORAGE_KEY, "zh"));
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("图例项是 button 且带 aria-pressed；点击触发 onToggle", () => {
    const toggles: number[] = [];
    const { getAllByRole } = renderLegend(getModel(DEFAULT_MODEL_ID), (i) => toggles.push(i));
    const items = getAllByRole("button", { name: /植物种群/ });
    expect(items.length).toBe(1);
    expect(items[0].getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(items[0]);
    expect(toggles).toEqual([0]);
  });

  it("物种名超长省略时 title 提供完整名（en 界面）", () => {
    localStorage.setItem(STORAGE_KEY, "en");
    const { getByTitle } = renderLegend(getModel(DEFAULT_MODEL_ID));
    expect(getByTitle("Snowshoe hare population")).toBeTruthy();
  });

  it("不渲染说明句 legend-note（已移除）", () => {
    const { container } = renderLegend(getModel(DEFAULT_MODEL_ID));
    expect(container.querySelector(".legend-note")).toBeNull();
  });
});
