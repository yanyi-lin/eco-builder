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

  return (
    <>
      <div className="left-chart-area">
        <div className="chart-controls">
          <button className="ctrl-btn" onClick={handlePrimary}>
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
        </div>
        <div className="chart-container">
          <canvas ref={chart.canvasRef} width={800} height={450} role="img" aria-label={canvasAria} />
        </div>
      </div>

      <div className="right-panel">
        <CustomLegend
          spec={sim.spec}
          hiddenStates={hiddenStates}
          onToggle={handleToggle}
        />
        <DisturbPanel
          spec={sim.spec}
          onDisturb={sim.applyDisturbance}
        />
      </div>
    </>
  );
}
