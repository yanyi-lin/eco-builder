import { useEffect, useRef } from "react";
import {
  Chart,
  type ChartConfiguration,
  type ChartData,
  type ChartDataset,
} from "chart.js/auto";
import type { EcoModelSpec } from "./types";
import { displayName } from "./i18n";
import { useI18n } from "../i18n/LanguageProvider";

/** 图表渲染最小间隔（ms）：模拟步进 38ms，全量重绘（900 点 × N 数据集）较贵，
 *  每步都同步 update 会导致 rAF 任务堆积（Chrome "requestAnimationFrame handler
 *  用时超 50ms" Violation）。合并 + 节流后渲染频率 ~12fps，曲线仍连续。 */
const RENDER_INTERVAL_MS = 80;

export interface UseEcoChart {
  /** canvas ref，组件挂到 <canvas> 上 */
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** 同步最新数据到图表并刷新（按 spec.species 顺序填充 dataset） */
  setData: (
    history: Record<string, number[]>,
    timeData: number[],
  ) => void;
  /** 重置所有曲线可见性 */
  resetDatasetsVisibility: () => void;
  /** 切换某条曲线可见性 */
  toggleDataset: (index: number) => void;
}

export function useEcoChart(spec: EcoModelSpec): UseEcoChart {
  const { lang, t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart<"line"> | null>(null);
  // 持有最新 spec，供方法闭包读取，避免 spec 切换后引用旧值
  const specRef = useRef(spec);
  specRef.current = spec;
  // 缓存最近一次 setData 的数据，建图后立即回填（解决 spec 切换/StrictMode 时序）
  const lastDataRef = useRef<{
    history: Record<string, number[]>;
    timeData: number[];
  } | null>(null);
  // 渲染合并/节流：同一帧内多次 setData 只渲染一次；距上次渲染 < RENDER_INTERVAL_MS
  // 则推迟（修复 rAF Violation：38ms 步进 + 全量重绘导致 rAF 队列堆积）
  const rafRef = useRef<number | null>(null);
  const lastRenderAtRef = useRef(0);

  const buildDatasets = (currentSpec: EcoModelSpec): ChartDataset<"line">[] => {
    return currentSpec.species.map((s) => ({
      label: displayName(s.name, s.name_en, lang),
      data: [],
      borderColor: s.color,
      borderWidth: 2.8,
      tension: 0.2,
      pointRadius: 0,
      fill: false,
      yAxisID: s.axis === "left" ? "y-plant" : "y-prey",
    }));
  };

  /** 动态适配 Y 轴范围（issue #8）：模拟中种群可能超过构建时由 initial/K
   *  计算出的 axisRanges 上限（如两个物种 80 与 200，200 超出可视区）。
   *  按数据集归属的左/右轴分别统计实际最大值，超出硬编码上限时扩展；
   *  不自动收窄（避免曲线抖动），min 保持构建时下限。 */
  const applyAxisAutoScale = (chart: Chart<"line">) => {
    const currentSpec = specRef.current;
    const initialMax: Record<"left" | "right", number> = {
      left: currentSpec.axisRanges.left.max,
      right: currentSpec.axisRanges.right.max,
    };
    const actualMax: Record<"left" | "right", number> = { left: 0, right: 0 };
    currentSpec.species.forEach((s, i) => {
      const arr = chart.data.datasets[i]?.data as number[] | undefined;
      if (!arr) return;
      for (const v of arr) {
        if (isFinite(v) && v > actualMax[s.axis]) actualMax[s.axis] = v;
      }
    });
    (["left", "right"] as const).forEach((side) => {
      const scale = chart.options.scales?.[side === "left" ? "y-plant" : "y-prey"];
      if (!scale) return;
      const target = Math.max(initialMax[side], actualMax[side] * 1.15);
      if (target > (scale.max as number)) {
        scale.max = target;
      }
    });
  };

  /** 创建图表实例。
   *  若 canvas 上已注册 Chart 实例（StrictMode 重挂载残留），先销毁它再创建，
   *  避免 "Canvas is already in use"。仅检查 canvas 本身的注册，不动 chartRef。 */
  const createChart = (): Chart<"line"> | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    // 防止 canvas 被占用：销毁该 canvas 上已注册的任何实例
    const occupied = Chart.getChart(canvas);
    if (occupied) {
      occupied.destroy();
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const currentSpec = specRef.current;
    const left = currentSpec.axisRanges.left;
    const right = currentSpec.axisRanges.right;

    const config: ChartConfiguration<"line"> = {
      type: "line",
      data: {
        labels: ["0"],
        datasets: buildDatasets(currentSpec),
      } as ChartData<"line">,
      options: {
        responsive: true,
        maintainAspectRatio: true,
        interaction: { mode: "index", intersect: false },
        plugins: {
          tooltip: {
            mode: "index",
            intersect: false,
            callbacks: {
              label: (c) =>
                `${c.dataset.label}: ${(c.raw as number).toFixed(1)} ${String(t("chart.tooltipUnit"))}`,
            },
          },
          legend: { display: false },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: String(t("chart.axisTime")),
              color: "#3a6b3a",
              font: { weight: "bold" },
            },
            grid: { color: "#e2efda" },
          },
          "y-plant": {
            type: "linear",
            position: "left",
            title: {
              display: true,
              text: displayName(left.title, left.title_en, lang),
              color: left.color,
              font: { weight: "bold" },
            },
            min: left.min,
            max: left.max,
            grid: { color: "#e2e9dc" },
            ticks: { stepSize: left.step, color: left.color },
          },
          "y-prey": {
            type: "linear",
            position: "right",
            title: {
              display: true,
              text: displayName(right.title, right.title_en, lang),
              color: right.color,
              font: { weight: "bold" },
            },
            min: right.min,
            max: right.max,
            grid: { drawOnChartArea: false },
            ticks: { stepSize: right.step, color: right.color },
          },
        },
        elements: { line: { borderJoinStyle: "round" } },
      },
    };

    const instance = new Chart(ctx, config);
    chartRef.current = instance;
    // 建图后立即回填最近一次数据（spec 切换/StrictMode 重挂载时保持数据连续）
    if (lastDataRef.current) {
      const { history, timeData } = lastDataRef.current;
      currentSpec.species.forEach((s, i) => {
        instance.data.datasets[i].data = [...(history[s.id] ?? [])];
      });
      instance.data.labels = timeData.map((t) => t.toFixed(1));
      applyAxisAutoScale(instance);
      instance.update("none");
    }
    return instance;
  };

  /** 销毁 chartRef 持有的实例并清空 ref。仅动 chartRef，不查 canvas 注册表
   *  （避免在重复挂载循环中误杀新实例）。同时取消待执行的渲染 rAF。 */
  const destroyChart = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }
  };

  /** 渲染调度（rAF 合并 + 节流）：同帧多次调用只渲染一次；距上次渲染不足
   *  RENDER_INTERVAL_MS 时推迟到下一帧（数据已更新，仅渲染延迟，视觉无感） */
  const scheduleRender = (chart: Chart<"line">) => {
    if (rafRef.current !== null) return; // 已有待执行渲染
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const now = performance.now();
      if (now - lastRenderAtRef.current < RENDER_INTERVAL_MS) {
        scheduleRender(chart); // 太频繁，推迟一帧
        return;
      }
      lastRenderAtRef.current = now;
      chart.update("none");
    });
  };

  const setData = (
    history: Record<string, number[]>,
    timeData: number[],
  ) => {
    // 缓存数据，供建图后回填
    lastDataRef.current = { history, timeData };
    const chart = chartRef.current;
    if (!chart) return; // 图表未就绪时跳过（建图后会从缓存回填）
    const currentSpec = specRef.current;
    // 防御：dataset 数量与 species 不匹配则跳过（spec 切换瞬间）
    if (chart.data.datasets.length !== currentSpec.species.length) return;
    // 数据直接更新（轻量：改 data 引用，不触发渲染）
    currentSpec.species.forEach((s, i) => {
      chart.data.datasets[i].data = [...(history[s.id] ?? [])];
    });
    chart.data.labels = timeData.map((t) => t.toFixed(1));
    // 动态适配 Y 轴范围（issue #8）：种群可能超过构建时轴上限，扩展可视区
    applyAxisAutoScale(chart);
    // 渲染交给 rAF 合并调度（修复 rAF Violation）
    scheduleRender(chart);
  };

  const resetDatasetsVisibility = () => {
    const chart = chartRef.current;
    if (!chart) return;
    for (let i = 0; i < chart.data.datasets.length; i++) {
      chart.data.datasets[i].hidden = false;
    }
    chart.update();
  };

  const toggleDataset = (index: number) => {
    const chart = chartRef.current;
    if (!chart) return;
    const ds = chart.data.datasets[index];
    if (!ds) return;
    ds.hidden = !ds.hidden;
    chart.update();
  };

  // 语言切换：不重建 Chart 实例（重建会丢曲线可见性状态），直接 patch
  // dataset label / 轴标题 / tooltip 闭包后 update("none")（BILINGUAL-PLAN L4）
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const currentSpec = specRef.current;
    currentSpec.species.forEach((s, i) => {
      const ds = chart.data.datasets[i];
      if (ds) ds.label = displayName(s.name, s.name_en, lang);
    });
    const scales = chart.options.scales;
    if (scales?.x?.title) scales.x.title.text = String(t("chart.axisTime"));
    const left = currentSpec.axisRanges.left;
    const right = currentSpec.axisRanges.right;
    if (scales?.["y-plant"]?.title) {
      scales["y-plant"].title.text = displayName(left.title, left.title_en, lang);
    }
    if (scales?.["y-prey"]?.title) {
      scales["y-prey"].title.text = displayName(right.title, right.title_en, lang);
    }
    const tooltip = chart.options.plugins?.tooltip;
    if (tooltip?.callbacks) {
      tooltip.callbacks.label = (c) =>
        `${c.dataset.label}: ${(c.raw as number).toFixed(1)} ${String(t("chart.tooltipUnit"))}`;
    }
    chart.update("none");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, t]);

  // 单一 effect 管理图表生命周期。
  // 关键：cleanup 用 destroyChart（仅 chartRef），createChart 用 Chart.getChart(canvas)
  // 防占用。两者检查不同对象，避免 StrictMode 重挂载循环中互相误杀。
  useEffect(() => {
    createChart();
    return () => {
      destroyChart();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.id]);

  return {
    canvasRef,
    setData,
    resetDatasetsVisibility,
    toggleDataset,
  };
}
