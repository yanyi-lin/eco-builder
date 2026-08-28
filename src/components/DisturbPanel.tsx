import { useRef, useState } from "react";
import type { EcoModelSpec } from "../eco/types";
import { DISTURB_PERCENTS } from "../eco/constants";
import { displayName } from "../eco/i18n";
import { useI18n } from "../i18n/LanguageProvider";

interface DisturbPanelProps {
  spec: EcoModelSpec;
  onDisturb: (speciesId: string, percent: number) => void;
}

/** 种群干预（扰动）面板：横排布局，每行 = 物种色点标签 + 三档减百分按钮。
 *  触发后该行播放一次脉冲动画，强化「干预 → 系统响应」的教学叙事
 *  （prefers-reduced-motion 下自动禁用，见 styles.css 全局覆盖）。
 *  面板可折叠（物种多时收起省空间）；展开时物种行区限高（约 3 行）
 *  内部滚动，避免 AI 构建的多物种模型把面板撑得过长。 */
export function DisturbPanel({ spec, onDisturb }: DisturbPanelProps) {
  const { lang, t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const [pulsingId, setPulsingId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDisturb = (speciesId: string, percent: number) => {
    onDisturb(speciesId, percent);
    setPulsingId(speciesId);
    if (timerRef.current) clearTimeout(timerRef.current);
    // 动画时长与 CSS --pulse-duration 保持一致（0.7s）
    timerRef.current = setTimeout(() => setPulsingId(null), 700);
  };

  return (
    <div className="disturb-section">
      {/* 标题栏即折叠开关（同 AI 抽屉交互），chevron 指示开合方向 */}
      <button
        type="button"
        className="disturb-toggle"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
        aria-controls="disturb-body"
        title={collapsed ? String(t("disturb.expand")) : String(t("disturb.collapse"))}
      >
        <span>{t("disturb.title")}</span>
        <svg
          className="disturb-chev"
          viewBox="0 0 16 16"
          aria-hidden="true"
          width="14"
          height="14"
        >
          <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div id="disturb-body" className="disturb-body" hidden={collapsed}>
        {/* 物种行滚动区：max-height 约 3 行（styles.css .disturb-scroll） */}
        <div className="disturb-scroll">
          {spec.species.map((s) => {
            const name = displayName(s.name, s.name_en, lang);
            return (
              <div key={s.id} className={`disturb-group${pulsingId === s.id ? " pulse" : ""}`}>
                <div className="group-label">
                  <span
                    aria-hidden="true"
                    className="group-dot"
                    style={{ background: s.color }}
                  />
                  {name}
                </div>
                <div className="button-row">
                  {DISTURB_PERCENTS.map((p) => (
                    <button
                      key={p}
                      className="disturb-btn"
                      onClick={() => handleDisturb(s.id, p)}
                      aria-label={String(t("disturb.reduceAria"))
                        .replace("{species}", name)
                        .replace("{percent}", String(Math.round(p * 100)))}
                    >
                      -{Math.round(p * 100)}%
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="note">
          {t("disturb.note")}
        </div>
      </div>
    </div>
  );
}
