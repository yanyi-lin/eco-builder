import type { EcoModelSpec } from "../eco/types";
import { displayName } from "../eco/i18n";
import { useI18n } from "../i18n/LanguageProvider";

interface CustomLegendProps {
  spec: EcoModelSpec;
  /** 各 dataset 当前 hidden 状态，index 对应 spec.species 顺序 */
  hiddenStates: boolean[];
  onToggle: (index: number) => void;
}

export function CustomLegend({ spec, hiddenStates, onToggle }: CustomLegendProps) {
  const { lang, t } = useI18n();
  const leftRange = spec.axisRanges.left;
  const rightRange = spec.axisRanges.right;
  const nameOf = (s: (typeof spec.species)[number]) => displayName(s.name, s.name_en, lang);
  return (
    <div className="legend-section">
      <div className="legend-title">{t("legend.title")}</div>
      {spec.species.map((s, i) => {
        const rangeText =
          s.axis === "left"
            ? `${String(t("legend.leftAxis"))} ${leftRange.min}~${leftRange.max}`
            : `${String(t("legend.rightAxis"))} ${rightRange.min}~${rightRange.max}`;
        return (
          <div
            key={s.id}
            className={`legend-item${hiddenStates[i] ? " hidden" : ""}`}
            onClick={() => onToggle(i)}
          >
            <div className="color-badge" style={{ background: s.color }} />
            {s.icon && (
              <img
                className="legend-icon"
                src={s.icon}
                alt={`${nameOf(s)}${String(t("legend.iconAlt"))}`}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            )}
            <span className="species-name">{nameOf(s)}</span>
            <span className="scale-info">{rangeText}</span>
          </div>
        );
      })}
      <div className="note">
        ※ {spec.species.filter((s) => s.axis === "left").map((s) => nameOf(s)).join("、") || t("legend.leftFallback")}{t("legend.noteLeft")}
        {spec.species.filter((s) => s.axis === "right").map((s) => nameOf(s)).join("、") || t("legend.otherFallback")}{t("legend.noteRight")}
        {t("legend.noteToggle")}
      </div>
    </div>
  );
}
