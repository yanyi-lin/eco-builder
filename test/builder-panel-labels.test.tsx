// @vitest-environment jsdom
// 构建面板参数行双语测试：
// - zh 界面显示 paramMeta.label（中文）
// - en 界面显示 paramMeta.label_en（英文）
// - label_en 缺省时 en 界面退化为中文 label（与 EcoTunerModal 行为一致）
// 背景：修复前 BuilderPanel 直接渲染 meta.label，英文界面暴露中文标签。
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { LanguageProvider } from "../src/i18n/LanguageProvider";
import { BuilderPanel } from "../src/components/BuilderPanel";
import type { UseEcoBuilder } from "../src/eco/useEcoBuilder";
import type { ParamMeta } from "../src/eco/types";

const STORAGE_KEY = "eco-builder-lang";

function meta(overrides: Partial<ParamMeta> = {}): ParamMeta {
  return {
    label: "dt (积分步长)",
    label_en: "dt (Integration step)",
    group: "dynamic",
    min: 0.01,
    max: 0.1,
    step: 0.001,
    digits: 3,
    ...overrides,
  };
}

function fakeBuilder(paramMeta: Record<string, ParamMeta>): UseEcoBuilder {
  return {
    state: {
      species: [],
      relations: [],
      params: { dt: 0.045 },
      paramMeta,
    },
    api: {} as UseEcoBuilder["api"],
    addSpecies: () => {},
    removeSpecies: () => {},
    addRelation: () => {},
    removeRelation: () => {},
    reset: () => {},
    buildAndRun: () => {},
  };
}

function renderPanel(builder: UseEcoBuilder) {
  return render(
    <LanguageProvider>
      <BuilderPanel builder={builder} />
    </LanguageProvider>,
  );
}

describe("BuilderPanel 参数标签双语", () => {
  beforeEach(() => localStorage.setItem(STORAGE_KEY, "zh"));
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("zh 界面显示中文 label", () => {
    const { getByTitle } = renderPanel(fakeBuilder({ dt: meta() }));
    expect(getByTitle("dt").textContent).toContain("dt (积分步长)");
  });

  it("en 界面显示 label_en", () => {
    localStorage.setItem(STORAGE_KEY, "en");
    const { getByTitle } = renderPanel(fakeBuilder({ dt: meta() }));
    expect(getByTitle("dt").textContent).toContain("dt (Integration step)");
  });

  it("label_en 缺省时 en 界面退化为中文 label", () => {
    localStorage.setItem(STORAGE_KEY, "en");
    const { getByTitle } = renderPanel(
      fakeBuilder({
        dt: meta({ label_en: undefined }),
      }),
    );
    expect(getByTitle("dt").textContent).toContain("dt (积分步长)");
  });

  it("无 paramMeta 的参数键显示键名本身", () => {
    const { getByTitle } = renderPanel(fakeBuilder({}));
    expect(getByTitle("dt").textContent).toContain("dt");
  });
});
