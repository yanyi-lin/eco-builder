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
                <ModelSelector value={modelId} onChange={handleModelChange} disabled />
                <button
                  className="info-btn"
                  onClick={() => setInfoOpen(true)}
                  aria-label="模型说明"
                >
                  i
                </button>
                {/* GitHub 章鱼猫：低调半透明图标，跳转仓库（无文字说明） */}
                <a
                  className="github-link"
                  href="https://github.com/yanyi-lin/eco-builder"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="GitHub 仓库"
                >
                  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                  </svg>
                </a>
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
