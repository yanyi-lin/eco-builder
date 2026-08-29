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
import { DisturbPanel } from "./components/DisturbPanel";
import { AgentChatDrawer } from "./components/ai/AgentChatDrawer";
import { useEcoAgent } from "./components/ai/useEcoAgent";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { useI18n } from "./i18n/LanguageProvider";
import { displayName } from "./eco/i18n";
import type { EcoModelSpec } from "./eco/types";

/** 定位站基准点标识：三层等高线圈 + 中心样点（纯装饰，语义由文字承担） */
function StationMark() {
  return (
    <svg className="station-mark" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="20" cy="20" r="15" opacity="0.35" />
        <circle cx="21" cy="18.5" r="10.5" opacity="0.55" />
        <circle cx="22.5" cy="17.5" r="6" opacity="0.8" />
      </g>
      <circle cx="23.5" cy="17" r="2.2" fill="currentColor" />
    </svg>
  );
}

/** GitHub 章鱼猫路径（图标按钮内容） */
function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

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
  // 桌面端（>960px）扰动面板提升为 workbench 左列侧栏；默认展开
  const isWide = useMediaQuery("(min-width: 961px)");
  const [disturbOpen, setDisturbOpen] = useState(true);
  // 桌面模拟模式才启用侧栏形态（构建模式无扰动语义，移动端用文档流面板）
  const disturbRail = isWide && mode === "simulate";

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
      {/* 站牌页头：标识 + 当前观测对象（模拟=模型名 / 构建=构建器） */}
      <header className="masthead">
        <div className="masthead-id">
          <StationMark />
          <div className="masthead-titles">
            <span className="masthead-eyebrow">eco-builder</span>
            <div className="masthead-title-row">
              {mode === "build" && (
                <span className="mode-flag">{String(t("app.modeBuild"))}</span>
              )}
              <h1 className="masthead-title">
                {mode === "build"
                  ? t("app.title.build")
                  : spec
                    ? displayName(spec.name, spec.name_en, lang)
                    : t("app.title.simulate")}
              </h1>
            </div>
            {/* 副题：模拟模式显示模型 id（数据层铭牌），构建模式显示定位语 */}
            <span className="masthead-sub">
              {mode === "build"
                ? String(t("info.purpose"))
                : spec
                  ? spec.id
                  : ""}
            </span>
          </div>
        </div>
        <div className="masthead-actions">
          {/* 语言分段开关（当前语言松绿高亮） */}
          <div className="lang-switch" role="group" aria-label={String(t("lang.label"))}>
            <button
              type="button"
              className={`lang-opt${lang === "zh" ? " active" : ""}`}
              onClick={() => setLang("zh")}
              aria-pressed={lang === "zh"}
            >
              中文
            </button>
            <button
              type="button"
              className={`lang-opt${lang === "en" ? " active" : ""}`}
              onClick={() => setLang("en")}
              aria-pressed={lang === "en"}
            >
              EN
            </button>
          </div>
          {/* 模型信息（i） */}
          <button
            type="button"
            className="icon-btn"
            onClick={() => setInfoOpen(true)}
            aria-label={String(t("app.modelInfo"))}
            title={String(t("app.modelInfo"))}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm-.25 6h1.5v7h-1.5v-7Zm0-3h1.5v1.5h-1.5V7Z" />
            </svg>
          </button>
          {/* 模式切换：模拟 ↔ 构建（aria-pressed 暴露当前模式） */}
          <button
            type="button"
            className="btn btn-primary mode-btn"
            onClick={mode === "simulate" ? handleSwitchToBuild : handleSwitchToSimulate}
            aria-pressed={mode === "build"}
            aria-label={`${String(t("app.modeToggleAria"))} ${mode === "build" ? String(t("app.modeBuild")) : String(t("app.modeSimulate"))}`}
          >
            {mode === "simulate"
              ? String(t("app.switchToBuild"))
              : String(t("app.switchToSimulate"))}
          </button>
          {/* GitHub 仓库（低调 ghost 图标钮） */}
          <a
            className="icon-btn gh-link"
            href="https://github.com/yanyi-lin/eco-builder"
            target="_blank"
            rel="noreferrer"
            aria-label={String(t("app.githubRepo"))}
            title={String(t("app.githubRepo"))}
          >
            <GitHubIcon />
          </a>
          {/* 模型选择器（历史遗留，隐藏保留） */}
          <ModelSelector value={modelId} onChange={handleModelChange} disabled />
        </div>
      </header>

      {/* 工作台：左扰动侧栏（桌面模拟模式）+ 观察窗 + 右野账（AI 抽屉） */}
      <main
        className={[
          "workbench",
          aiCollapsed ? "rail" : "",
          disturbRail ? "has-disturb" : "",
          disturbRail && !disturbOpen ? "disturb-rail" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {/* 桌面模拟模式：扰动侧栏（收起 = 52px 轨道） */}
        {disturbRail && (
          <DisturbPanel
            spec={spec}
            onDisturb={sim.applyDisturbance}
            rail
            railOpen={disturbOpen}
            onToggleRail={() => setDisturbOpen((v) => !v)}
          />
        )}
        <section className="deck">
          {mode === "build" ? (
            <BuilderPanel builder={builder} />
          ) : (
            <ChartPanel sim={sim} chart={chart} showDisturb={!isWide} />
          )}
        </section>
        <Suspense fallback={<div className="chat-fallback">{t("chat.fallback")}</div>}>
          <AgentChatDrawer
            agent={agent}
            collapsed={aiCollapsed}
            onToggle={() => setAiCollapsed((c) => !c)}
          />
        </Suspense>
      </main>

      {/* 信息弹窗（i 按钮；两种模式均可用） */}
      <InfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
      {/* Eco-Tuner（触发入口已移除，组件保留供后续扩展；仅模拟模式可挂载） */}
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
