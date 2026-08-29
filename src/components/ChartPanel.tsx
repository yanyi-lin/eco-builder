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
  /** 是否在 deck 内渲染文档流形态的扰动面板：
   *  桌面端扰动面板提升为 workbench 左列侧栏（App 渲染），此处跳过。 */
  showDisturb?: boolean;
}

/** 模拟模式的观察窗：图表卡（通道带 + 记录纸 + 控制轨）与干预面板。 */
export function ChartPanel({ sim, chart, showDisturb = true }: ChartPanelProps) {
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

  // 主按钮状态机：未开始 → 开始；运行中 → 暂停；暂停中 → 继续
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

  // 控制轨时间读数：最新采样时刻
  const lastTime = sim.timeData[sim.timeData.length - 1];

  return (
    <div className="deck-chart">
      {/* 记录仪：通道带（图例）+ 绘图区 + 控制轨 */}
      <section className="chart-card">
        <CustomLegend
          spec={sim.spec}
          hiddenStates={hiddenStates}
          onToggle={handleToggle}
          counts={sim.history}
        />
        <div className="plot-frame">
          <canvas
            ref={chart.setCanvas}
            width={800}
            height={450}
            role="img"
            aria-label={canvasAria}
          />
        </div>
        <div className="control-rail">
          <button type="button" className="btn btn-primary" onClick={handlePrimary}>
            <PlayPauseIcon running={sim.simulationActive && sim.simulationRunning} />
            {primaryLabel}
          </button>
          {/* 重置属破坏性操作（清空曲线），仅在模拟已启动时提供 */}
          {sim.simulationActive && (
            <button type="button" className="btn btn-danger" onClick={sim.fullReset}>
              {t("chart.reset")}
            </button>
          )}
          <div className="rail-spacer" />
          {sim.simulationActive && (
            <span
              className="time-readout"
              aria-label={String(t("chart.timeReadout")).replace("{time}", lastTime.toFixed(1))}
            >
              t&nbsp;=&nbsp;<b>{lastTime.toFixed(1)}</b>
            </span>
          )}
        </div>
      </section>

      {/* 种群干预（扰动）开关排：桌面端由 App 渲染为左侧栏，此处仅在移动端出现 */}
      {showDisturb && <DisturbPanel spec={sim.spec} onDisturb={sim.applyDisturbance} />}
    </div>
  );
}

/** 主按钮内联图标：运行中显示暂停双杠，否则显示播放三角 */
function PlayPauseIcon({ running }: { running: boolean }) {
  return running ? (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="ctrl-icon">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="ctrl-icon">
      <path d="M8 5.5v13a1 1 0 0 0 1.54.84l10-6.5a1 1 0 0 0 0-1.68l-10-6.5A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}
