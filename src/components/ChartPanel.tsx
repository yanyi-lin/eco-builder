import { useEffect, useState } from "react";
import type { UseEcoSimulation } from "../eco/useEcoSimulation";
import type { UseEcoChart } from "../eco/useEcoChart";
import { CustomLegend } from "./CustomLegend";
import { DisturbPanel } from "./DisturbPanel";

interface ChartPanelProps {
  sim: UseEcoSimulation;
  chart: UseEcoChart;
  onOpenTuner: () => void;
}

export function ChartPanel({ sim, chart, onOpenTuner }: ChartPanelProps) {
  const [hiddenStates, setHiddenStates] = useState<boolean[]>(
    () => sim.spec.species.map(() => false),
  );

  // 数据变化时同步到图表（建图由 useEcoChart 的 effect 管理，此处仅同步数据）
  useEffect(() => {
    chart.setData(sim.history, sim.timeData);
  }, [sim.history, sim.timeData, chart]);

  // spec 切换时重置图例可见性（图表重建由 useEcoChart effect 自动处理）
  useEffect(() => {
    setHiddenStates(sim.spec.species.map(() => false));
  }, [sim.spec.id]);

  const handleToggle = (index: number) => {
    chart.toggleDataset(index);
    setHiddenStates((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  };

  const playPauseLabel = sim.simulationRunning ? "⏸️ 暂停" : "▶️ 开始";
  const startResetLabel = sim.simulationActive ? "🔄 重置模拟" : "▶️ 开始模拟";

  const handleStartReset = () => {
    if (!sim.simulationActive) sim.startSimulation();
    else sim.fullReset();
  };

  const handlePlayPause = () => {
    if (!sim.simulationActive) return;
    if (sim.simulationRunning) sim.pauseSimulation();
    else sim.resumeSimulation();
  };

  return (
    <>
      <div className="left-chart-area">
        <div className="chart-controls">
          <button
            className="ctrl-btn"
            disabled={!sim.simulationActive}
            onClick={handlePlayPause}
          >
            {playPauseLabel}
          </button>
          <button
            className={`ctrl-btn${sim.simulationActive ? "" : " secondary"}`}
            onClick={handleStartReset}
          >
            {startResetLabel}
          </button>
          <button
            className="ctrl-btn ecotuner-hidden"
            disabled
            onClick={onOpenTuner}
            title="Eco-Tuner（已禁用）"
          >
            🎛️ Eco-Tuner
          </button>
        </div>
        <div className="chart-container">
          <canvas ref={chart.canvasRef} width={800} height={450} />
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
