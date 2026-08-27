// @vitest-environment jsdom
// 图例组件测试：
// - 说明文字为整句 i18n 模板（legend.note），{left}/{right}/{n} 占位符正确替换
//   （背景：原多 key 拼接在英文下产生语序错误与缺空格，如 "axis.Click"）
// - 名单分隔符随语言切换（中文顿号 / 英文逗号）
// - 空轴时回退到 leftFallback / otherFallback
// - 图例项为 button（键盘可操作）、aria-pressed 表达隐藏态、title 提供完整名
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

describe("CustomLegend 说明文字模板", () => {
  beforeEach(() => localStorage.setItem(STORAGE_KEY, "zh"));
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  const spec = () => getModel(DEFAULT_MODEL_ID);

  it("中文：整句渲染，名单用顿号分隔，含采样点上限", () => {
    const { getByText } = renderLegend(spec());
    const note = getByText((_, el) => el?.className === "note")?.textContent ?? "";
    // 植物在左轴；雪兔、猞猁在右轴（顿号分隔）
    expect(note).toContain("植物种群位于左轴");
    expect(note).toContain("雪兔种群、猞猁种群位于右轴");
    expect(note).toContain("900"); // MAX_DATA_POINTS
    expect(note).toContain("点击图例可隐藏/显示曲线");
  });

  it("英文：整句渲染，名单用逗号分隔，英文种名", () => {
    localStorage.setItem(STORAGE_KEY, "en");
    const { getByText } = renderLegend(spec());
    const note = getByText((_, el) => el?.className === "note")?.textContent ?? "";
    expect(note).toContain("Plant population on the left axis");
    expect(note).toContain("Snowshoe hare population, Lynx population on the right axis");
    // 修复前 "axis.Click" 缺空格——说明句内部必须有正常空格衔接
    expect(note).toContain("right axis. Click a legend item");
  });

  it("左轴无物种时回退到 leftFallback（中文）", () => {
    const onlyRight = getModel(DEFAULT_MODEL_ID);
    // 把左轴物种改为右轴，制造左侧空列表
    onlyRight.species[0].axis = "right";
    const { getByText } = renderLegend(onlyRight);
    const note = getByText((_, el) => el?.className === "note")?.textContent ?? "";
    expect(note).toContain("左侧物种位于左轴");
  });

  it("英文回退文案拼入整句语法正确", () => {
    localStorage.setItem(STORAGE_KEY, "en");
    const onlyRight = getModel(DEFAULT_MODEL_ID);
    onlyRight.species[0].axis = "right";
    const { getByText } = renderLegend(onlyRight);
    const note = getByText((_, el) => el?.className === "note")?.textContent ?? "";
    expect(note).toContain("Left-side species on the left axis");
  });
});

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
});
