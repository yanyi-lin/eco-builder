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
  const { lang } = useI18n();
  const leftRange = spec.axisRanges.left;
  const rightRange = spec.axisRanges.right;
  const nameOf = (s: (typeof spec.species)[number]) => displayName(s.name, s.name_en, lang);
  return (
    <div className="legend-section">
      <div className="legend-title">📊 双Y轴说明 | 点击图例显示/隐藏曲线</div>
      {spec.species.map((s, i) => {
        const rangeText =
          s.axis === "left"
            ? `左轴 ${leftRange.min}~${leftRange.max}`
            : `右轴 ${rightRange.min}~${rightRange.max}`;
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
                alt={`${s.name}图标`}
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
        ※ {spec.species.filter((s) => s.axis === "left").map((s) => nameOf(s)).join("、") || "左侧"}物种在左轴，
        {spec.species.filter((s) => s.axis === "right").map((s) => nameOf(s)).join("、") || "其他"}物种在右轴。
        点击图例可隐藏/显示曲线，再次点击恢复。
      </div>
    </div>
  );
}
