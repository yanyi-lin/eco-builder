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
 *  （prefers-reduced-motion 下自动禁用，见 styles.css 全局覆盖）。 */
export function DisturbPanel({ spec, onDisturb }: DisturbPanelProps) {
  const { lang, t } = useI18n();
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
      <div className="disturb-title">{t("disturb.title")}</div>
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
      <div className="note">
        {t("disturb.note")}
      </div>
    </div>
  );
}
