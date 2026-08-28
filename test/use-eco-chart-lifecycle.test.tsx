// @vitest-environment jsdom
// useEcoChart 生命周期回归测试（核心 bug 防回归）：
// bug：hook 在 App 顶层调用而 canvas 在条件渲染的 ChartPanel 内。模式切换
// （simulate<->build）会卸载并重建 ChartPanel，产生新 canvas 元素；原实现
// canvas 用 useRef 持有且建图 effect 只依赖 [spec.id]，新 canvas 无人接管，
// 图表永久空白。修复：canvas 改为 useState 进入 effect 依赖。
// 本测试用 mock Chart 验证：canvas 元素替换必触发销毁重建。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { LanguageProvider } from "../src/i18n/LanguageProvider";
import { useEcoChart } from "../src/eco/useEcoChart";
import { getModel, DEFAULT_MODEL_ID } from "../src/eco/models";
import type { EcoModelSpec } from "../src/eco/types";

// Chart.js 在 jsdom 下无法真实渲染（无 2d context），mock 掉并记录生命周期。
// registry 经 vi.hoisted 共享给测试体（vi.mock 工厂会被提升到文件顶部）。
const { ChartMock, registry } = vi.hoisted(() => {
  const registry = {
    created: [] as { canvas: unknown }[],
    destroyedCount: 0,
  };
  class ChartMock {
    static getChart(): unknown {
      return null;
    }
    data: unknown;
    options: unknown;
    constructor(public config: Record<string, unknown>) {
      registry.created.push({ canvas: config });
      this.data = config?.data;
      this.options = config?.options;
    }
    destroy() {
      registry.destroyedCount++;
    }
    update() {}
  }
  return { ChartMock, registry };
});

vi.mock("chart.js/auto", () => ({ Chart: ChartMock }));

const specA = getModel(DEFAULT_MODEL_ID);
// 仅 id 不同的另一 spec（用于验证 spec.id 变化触发重建的既有行为）
const specB: EcoModelSpec = { ...specA, id: `${specA.id}-alt` };

function fakeCanvas(): HTMLCanvasElement {
  return {
    getContext: () => ({}),
    width: 300,
    height: 150,
  } as unknown as HTMLCanvasElement;
}

function renderChartHook(spec: EcoModelSpec) {
  return renderHook(({ spec: s }: { spec: EcoModelSpec }) => useEcoChart(s), {
    initialProps: { spec },
    wrapper: ({ children }) => <LanguageProvider>{children}</LanguageProvider>,
  });
}

describe("useEcoChart 生命周期", () => {
  beforeEach(() => {
    localStorage.setItem("eco-builder-lang", "zh");
    registry.created.length = 0;
    registry.destroyedCount = 0;
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("canvas 挂载后建图一次", () => {
    const { result } = renderChartHook(specA);
    expect(registry.created.length).toBe(0); // canvas 未挂载前不建图
    act(() => result.current.setCanvas(fakeCanvas()));
    expect(registry.created.length).toBe(1);
  });

  it("canvas 元素被替换时：销毁旧图并重建（核心回归点）", () => {
    const { result } = renderChartHook(specA);
    act(() => result.current.setCanvas(fakeCanvas()));
    expect(registry.created.length).toBe(1);

    // 模拟 ChartPanel 重挂载：新 canvas 元素进入
    act(() => result.current.setCanvas(fakeCanvas()));
    expect(registry.created.length).toBe(2);
    expect(registry.destroyedCount).toBe(1); // 旧实例销毁
  });

  it("canvas 卸载（置 null）时销毁图表", () => {
    const { result } = renderChartHook(specA);
    act(() => result.current.setCanvas(fakeCanvas()));
    expect(registry.created.length).toBe(1);
    act(() => result.current.setCanvas(null));
    expect(registry.destroyedCount).toBe(1);
  });

  it("spec.id 变化时重建图表（保持既有行为）", () => {
    const { result, rerender } = renderChartHook(specA);
    act(() => result.current.setCanvas(fakeCanvas()));
    expect(registry.created.length).toBe(1);

    // 同一 canvas 下 spec.id 变化（切换内置模型）→ 旧图销毁、新图重建
    rerender({ spec: specB });
    expect(registry.created.length).toBe(2);
    expect(registry.destroyedCount).toBe(1);
  });

  it("hook 卸载时销毁图表", () => {
    const { result, unmount } = renderChartHook(specA);
    act(() => result.current.setCanvas(fakeCanvas()));
    expect(registry.created.length).toBe(1);
    unmount();
    expect(registry.destroyedCount).toBe(1);
  });
});
