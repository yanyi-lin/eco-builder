import type { EcoModelSpec } from "../eco/types";
import { DISTURB_PERCENTS } from "../eco/constants";
import { displayName } from "../eco/i18n";
import { useI18n } from "../i18n/LanguageProvider";

interface DisturbPanelProps {
  spec: EcoModelSpec;
  onDisturb: (speciesId: string, percent: number) => void;
}

export function DisturbPanel({ spec, onDisturb }: DisturbPanelProps) {
  const { lang } = useI18n();
  return (
    <div className="disturb-section">
      <div className="disturb-title">⚡ 生态扰动 (减少种群数量)</div>
      {spec.species.map((s) => (
        <div key={s.id} className="disturb-group">
          <div className="group-label">
            <span
              style={{
                display: "inline-block",
                width: 12,
                height: 12,
                background: s.color,
                borderRadius: 2,
              }}
            />
            {displayName(s.name, s.name_en, lang)}
          </div>
          <div className="button-row">
            {DISTURB_PERCENTS.map((p) => (
              <button
                key={p}
                className="disturb-btn"
                onClick={() => onDisturb(s.id, p)}
              >
                -{Math.round(p * 100)}%
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="note">
        点击后即时减少当前种群对应百分比（不低于最小阈值），系统自动调节展现恢复力与周期性
      </div>
    </div>
  );
}
