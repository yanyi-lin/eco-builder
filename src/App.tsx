import { useMemo, useState, Suspense } from "react";
import { getModel, DEFAULT_MODEL_ID } from "./eco/models";
import { useEcoSimulation } from "./eco/useEcoSimulation";
import { useEcoChart } from "./eco/useEcoChart";
import { useEcoBuilder } from "./eco/useEcoBuilder";
import { ChartPanel } from "./components/ChartPanel";
import { ModelSelector } from "./components/ModelSelector";
import { InfoModal } from "./components/InfoModal";
import { EcoTunerModal } from "./components/EcoTunerModal";
import { BuilderPanel } from "./components/BuilderPanel";
import { AgentChatDrawer } from "./components/ai/AgentChatDrawer";
import { useEcoAgent } from "./components/ai/useEcoAgent";
import type { EcoModelSpec } from "./eco/types";

export function App() {
  const [mode, setMode] = useState<"simulate" | "build">("simulate");
  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
  const [customSpec, setCustomSpec] = useState<EcoModelSpec | null>(null);
  
  // 当前使用的 spec：仅在模拟模式下使用 customSpec，构建模式不污染 sim/chart
  const spec = useMemo(() => {
    if (mode === "simulate" && customSpec) return customSpec;
    return getModel(modelId);
  }, [mode, customSpec, modelId]);

  const sim = useEcoSimulation(spec);
  const chart = useEcoChart(spec);
  const builder = useEcoBuilder((newSpec) => {
    setCustomSpec(newSpec);
    setMode("simulate");
  });
  const agent = useEcoAgent(sim, builder, mode);

  const [infoOpen, setInfoOpen] = useState(false);
  const [tunerOpen, setTunerOpen] = useState(false);
  const [aiCollapsed, setAiCollapsed] = useState(false);

  const handleModelChange = (id: string) => {
    setModelId(id);
    setCustomSpec(null);
  };
  
  const handleSwitchToBuild = () => {
    setMode("build");
    builder.reset();
    // 构建模式依赖 AI 交互，自动展开抽屉
    setAiCollapsed(false);
  };
  
  const handleSwitchToSimulate = () => {
    setMode("simulate");
  };

  return (
    <div className="app-shell">
      <div className="dashboard">
        <div className="title-row">
          <h1>
            {mode === "build"
              ? "生态模型构建器"
              : spec?.name || "生态模型模拟"}
          </h1>
          <div className="title-actions">
            {mode === "simulate" ? (
              <>
                <ModelSelector value={modelId} onChange={handleModelChange} />
                <button
                  className="info-btn"
                  onClick={() => setInfoOpen(true)}
                  aria-label="模型说明"
                >
                  i
                </button>
              </>
            ) : (
              <span className="mode-badge">构建模式</span>
            )}
            <button
              className="mode-toggle-btn"
              onClick={mode === "simulate" ? handleSwitchToBuild : handleSwitchToSimulate}
            >
              {mode === "simulate" ? "构建新模型" : "返回模拟"}
            </button>
          </div>
        </div>

        <div className="main-layout">
          {mode === "build" ? (
            <BuilderPanel builder={builder} />
          ) : (
            <ChartPanel
              sim={sim}
              chart={chart}
              onOpenTuner={() => setTunerOpen(true)}
            />
          )}
          <Suspense fallback={<div className="chat-fallback">加载聊天中...</div>}>
            <AgentChatDrawer
              agent={agent}
              collapsed={aiCollapsed}
              onToggle={() => setAiCollapsed((c) => !c)}
            />
          </Suspense>
        </div>
      </div>

      {mode === "simulate" && (
        <>
          <InfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
          <EcoTunerModal
            spec={spec}
            currentParams={sim.params}
            open={tunerOpen}
            onClose={() => setTunerOpen(false)}
            onApply={(p) => sim.applyParams(p)}
          />
        </>
      )}
    </div>
  );
}
