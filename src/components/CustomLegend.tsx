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
  // 名单分隔符随语言切换（中文顿号 / 英文逗号）
  const joinNames = (list: (typeof spec.species)[number][]) =>
    list.map(nameOf).join(lang === "en" ? ", " : "、");
  // 图例说明为整句 i18n 模板（{left}/{right}/{n} 占位），避免多 key 拼接
  // 在英文下产生语序与空格问题
  const note = String(t("legend.note"))
    .replace(
      "{left}",
      joinNames(spec.species.filter((s) => s.axis === "left")) || String(t("legend.leftFallback")),
    )
    .replace(
      "{right}",
      joinNames(spec.species.filter((s) => s.axis === "right")) || String(t("legend.otherFallback")),
    )
    .replace("{n}", String(MAX_DATA_POINTS));
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
            {/* 空间不足时名称省略显示，悬停可看完整名 */}
            <span className="species-name" title={nameOf(s)}>{nameOf(s)}</span>
            <span className="scale-info">{rangeText}</span>
          </button>
        );
      })}
      <div className="note">※ {note}</div>
    </div>
  );
}
