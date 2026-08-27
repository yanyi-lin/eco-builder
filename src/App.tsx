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
import { useI18n } from "./i18n/LanguageProvider";
import { displayName } from "./eco/i18n";
import type { EcoModelSpec } from "./eco/types";

export function App() {
  const { lang, setLang, t } = useI18n();
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
        <header className="site-header">
          <div className="site-id">
            {/* 样方标签（签名元素）：图鉴编号 + 双语副标，博物学记录纸气质。
                内置模型为 No.001，AI 构建的定制模型为 No.002 */}
            {mode === "simulate" && spec && (
              <span className="plot-tag">
                {customSpec ? "No.002" : "No.001"} · {String(t("plot.label"))}
              </span>
            )}
            {mode === "build" && <span className="plot-tag">{String(t("app.modeBuild"))}</span>}
            <h1 className="site-title">
              {mode === "build"
                ? t("app.title.build")
                : spec
                  ? displayName(spec.name, spec.name_en, lang)
                  : t("app.title.simulate")}
            </h1>
            {/* 双语副标：当前语言展示另一语言的模型名（斜体，图鉴学名气质） */}
            {mode === "simulate" && spec && (
              <span className="plot-sub">
                {lang === "zh" ? spec.name_en : spec.name}
              </span>
            )}
          </div>
          <div className="site-actions">
            {/* 1. 语言选择长条（分段控件：中文/EN，当前语言深色高亮） */}
            <div className="lang-toggle" role="group" aria-label={String(t("lang.label"))}>
              <button
                className={`lang-opt${lang === "zh" ? " active" : ""}`}
                onClick={() => setLang("zh")}
                aria-pressed={lang === "zh"}
              >
                中文
              </button>
              <button
                className={`lang-opt${lang === "en" ? " active" : ""}`}
                onClick={() => setLang("en")}
                aria-pressed={lang === "en"}
              >
                EN
              </button>
            </div>
            {/* 2. i 按钮（信息弹窗，两种模式都可用） */}
            <button
              className="info-btn"
              onClick={() => setInfoOpen(true)}
              aria-label={String(t("app.modelInfo"))}
            >
              i
            </button>
            {/* 3. 构建模式长条（切换模拟/构建，aria-pressed 暴露当前模式给辅助技术） */}
            <button
              className="mode-toggle-btn"
              onClick={mode === "simulate" ? handleSwitchToBuild : handleSwitchToSimulate}
              aria-pressed={mode === "build"}
              aria-label={`${String(t("app.modeToggleAria"))} ${mode === "build" ? String(t("app.modeBuild")) : String(t("app.modeSimulate"))}`}
            >
              {mode === "simulate" ? String(t("app.switchToBuild")) : String(t("app.switchToSimulate"))}
            </button>
            {/* 4. GitHub 章鱼猫：低调半透明（小于其他按钮），跳转仓库 */}
            <a
              className="github-link"
              href="https://github.com/yanyi-lin/eco-builder"
              target="_blank"
              rel="noreferrer"
              aria-label={String(t("app.githubRepo"))}
            >
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
              </svg>
            </a>
            {/* 模型选择器（历史遗留，隐藏保留） */}
            <ModelSelector value={modelId} onChange={handleModelChange} disabled />
          </div>
        </header>

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
          <Suspense fallback={<div className="chat-fallback">{t("chat.fallback")}</div>}>
            <AgentChatDrawer
              agent={agent}
              collapsed={aiCollapsed}
              onToggle={() => setAiCollapsed((c) => !c)}
            />
          </Suspense>
        </div>
      </div>

      {/* InfoModal 两种模式均可打开（i 按钮常驻；此前 build 模式点击无响应） */}
      <InfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
      {mode === "simulate" && (
        <EcoTunerModal
          spec={spec}
          currentParams={sim.params}
          open={tunerOpen}
          onClose={() => setTunerOpen(false)}
          onApply={(p) => sim.applyParams(p)}
        />
      )}
    </div>
  );
}
