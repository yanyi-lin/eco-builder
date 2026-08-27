import type { EcoModelSpec } from "../eco/types";
import { MAX_DATA_POINTS } from "../eco/constants";
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
  const windowNote = String(t("legend.windowNote")).replace("{n}", String(MAX_DATA_POINTS));
  return (
    <div className="legend-section">
      <div className="legend-title">{t("legend.title")}</div>
      {spec.species.map((s, i) => {
        const rangeText =
          s.axis === "left"
            ? `${String(t("legend.leftAxis"))} ${leftRange.min}~${leftRange.max}`
            : `${String(t("legend.rightAxis"))} ${rightRange.min}~${rightRange.max}`;
        const hidden = !!hiddenStates[i];
        return (
          // 图例项为可交互按钮（修复：原为 div onClick，键盘与读屏无法操作），
          // aria-pressed 表达「曲线隐藏/显示」状态
          <button
            key={s.id}
            type="button"
            className={`legend-item${hidden ? " hidden" : ""}`}
            onClick={() => onToggle(i)}
            aria-pressed={hidden}
          >
            <div className="color-badge" style={{ background: s.color }} aria-hidden="true" />
            {s.icon && (
              <img
                className="legend-icon"
                src={s.icon}
                alt=""
                aria-hidden="true"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            )}
            <span className="species-name">{nameOf(s)}</span>
            <span className="scale-info">{rangeText}</span>
          </button>
        );
      })}
      <div className="note">
        ※ {spec.species.filter((s) => s.axis === "left").map((s) => nameOf(s)).join("、") || t("legend.leftFallback")}{t("legend.noteLeft")}
        {spec.species.filter((s) => s.axis === "right").map((s) => nameOf(s)).join("、") || t("legend.otherFallback")}{t("legend.noteRight")}
        {t("legend.noteToggle")}
        {windowNote}
      </div>
    </div>
  );
}
