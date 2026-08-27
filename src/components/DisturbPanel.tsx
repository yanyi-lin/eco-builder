import type { EcoModelSpec } from "../eco/types";
import { DISTURB_PERCENTS } from "../eco/constants";
import { displayName } from "../eco/i18n";
import { useI18n } from "../i18n/LanguageProvider";

interface DisturbPanelProps {
  spec: EcoModelSpec;
  onDisturb: (speciesId: string, percent: number) => void;
}

export function DisturbPanel({ spec, onDisturb }: DisturbPanelProps) {
  const { lang, t } = useI18n();
  return (
    <div className="disturb-section">
      <div className="disturb-title">{t("disturb.title")}</div>
      {spec.species.map((s) => {
        const name = displayName(s.name, s.name_en, lang);
        return (
          <div key={s.id} className="disturb-group">
            <div className="group-label">
              <span
                aria-hidden="true"
                style={{
                  display: "inline-block",
                  width: 12,
                  height: 12,
                  background: s.color,
                  borderRadius: 2,
                }}
              />
              {name}
            </div>
            <div className="button-row">
              {DISTURB_PERCENTS.map((p) => (
                <button
                  key={p}
                  className="disturb-btn"
                  onClick={() => onDisturb(s.id, p)}
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
