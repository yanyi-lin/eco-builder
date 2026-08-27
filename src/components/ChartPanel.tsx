import { useEffect, useState } from "react";
import type { UseEcoSimulation } from "../eco/useEcoSimulation";
import type { UseEcoChart } from "../eco/useEcoChart";
import { CustomLegend } from "./CustomLegend";
import { useI18n } from "../i18n/LanguageProvider";
import { displayName } from "../eco/i18n";
import { DisturbPanel } from "./DisturbPanel";

interface ChartPanelProps {
  sim: UseEcoSimulation;
  chart: UseEcoChart;
  onOpenTuner: () => void;
}

export function ChartPanel({ sim, chart, onOpenTuner }: ChartPanelProps) {
  const { t, lang } = useI18n();
  const [hiddenStates, setHiddenStates] = useState<boolean[]>(
    () => sim.spec.species.map(() => false),
  );

  // 数据变化时同步到图表（建图由 useEcoChart 的 effect 管理，此处仅同步数据）
  useEffect(() => {
    chart.setData(sim.history, sim.timeData, sim.disturbances);
  }, [sim.history, sim.timeData, sim.disturbances, chart]);

  // spec 变化时重置图例可见性（图表重建由 useEcoChart effect 自动处理）
  useEffect(() => {
    setHiddenStates(sim.spec.species.map(() => false));
  }, [sim.spec]);

  const handleToggle = (index: number) => {
    chart.toggleDataset(index);
    setHiddenStates((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  };

  // 主按钮状态机：未开始 → 开始；运行中 → 暂停；暂停中 → 继续。
  // （修复：原实现未开始时同时渲染「开始」（禁用）与「开始模拟」（可用）两个按钮）
  const primaryLabel = !sim.simulationActive
    ? String(t("chart.start"))
    : sim.simulationRunning
      ? String(t("chart.pause"))
      : String(t("chart.resume"));

  const handlePrimary = () => {
    if (!sim.simulationActive) {
      sim.startSimulation();
      return;
    }
    if (sim.simulationRunning) sim.pauseSimulation();
    else sim.resumeSimulation();
  };

  const canvasAria = String(t("chart.canvasAria")).replace(
    "{species}",
    sim.spec.species
      .map((s) => displayName(s.name, s.name_en, lang))
      .join("、"),
  );

  // 控制条时间读数：最新采样时刻（数据已在 sim 中，纯显示无新交互）
  const lastTime = sim.timeData[sim.timeData.length - 1];

  return (
    <div className="plot-area">
      {/* 图表卡（主角）：canvas + 浮层样方标签 + 图例 chips */}
      <div className="chart-card">
        <div className="plot-tag-inline" aria-hidden="true">
          {t("plot.label")} · {displayName(sim.spec.name, sim.spec.name_en, lang)}
        </div>
        <CustomLegend
          spec={sim.spec}
          hiddenStates={hiddenStates}
          onToggle={handleToggle}
          counts={sim.history}
        />
        <div className="chart-container">
          <canvas ref={chart.setCanvas} width={800} height={450} role="img" aria-label={canvasAria} />
        </div>
      </div>

      {/* 走带控制条：播放器隐喻，移至图表下方 */}
      <div className="chart-controls">
        <button className="ctrl-btn" onClick={handlePrimary}>
          <PlayPauseIcon running={sim.simulationActive && sim.simulationRunning} />
          {primaryLabel}
        </button>
        {/* 重置属破坏性操作（清空曲线），仅在模拟已启动时提供 */}
        {sim.simulationActive && (
          <button className="ctrl-btn secondary" onClick={sim.fullReset}>
            {t("chart.reset")}
          </button>
        )}
        <button
          className="ctrl-btn ecotuner-hidden"
          disabled
          onClick={onOpenTuner}
          title={String(t("chart.ecoTunerTitle"))}
        >
          {t("chart.ecoTuner")}
        </button>
        {sim.simulationActive && (
          <span className="time-readout" aria-label={String(t("chart.timeReadout")).replace("{time}", lastTime.toFixed(1))}>
            t = <b>{lastTime.toFixed(1)}</b>
          </span>
        )}
      </div>

      {/* 种群干预（扰动）横排面板 */}
      <DisturbPanel
        spec={sim.spec}
        onDisturb={sim.applyDisturbance}
      />
    </div>
  );
}

/** 主按钮内联图标：运行中显示暂停双杠，否则显示播放三角 */
function PlayPauseIcon({ running }: { running: boolean }) {
  return running ? (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="ctrl-icon">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="ctrl-icon">
      <path d="M8 5.5v13a1 1 0 0 0 1.54.84l10-6.5a1 1 0 0 0 0-1.68l-10-6.5A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}
