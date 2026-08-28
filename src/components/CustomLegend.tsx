import type { EcoModelSpec } from "../eco/types";
import { MAX_DATA_POINTS } from "../eco/constants";
import { displayName } from "../eco/i18n";
import { useI18n } from "../i18n/LanguageProvider";

interface CustomLegendProps {
  spec: EcoModelSpec;
  /** 各 dataset 当前 hidden 状态，index 对应 spec.species 顺序 */
  hiddenStates: boolean[];
  onToggle: (index: number) => void;
  /** 各物种实时数量序列（chip 内显示最新值，纯显示） */
  counts?: Record<string, number[]>;
}

/** 图鉴式图例 chips：浮于图表卡右上角。
 *  色点 + 物种名 + 实时数量 + 轴徽章；点击切换曲线显隐（aria-pressed）。 */
export function CustomLegend({ spec, hiddenStates, onToggle, counts }: CustomLegendProps) {
  const { lang, t } = useI18n();
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

  // 物种较多（>4）时图例从浮层转为图表上方文档流（限高内滚动），
  // 避免浮层大面积遮挡曲线（10 物种实测遮挡绘图区 47%）
  const stacked = spec.species.length > 4;

  return (
    <div className={`legend-chips${stacked ? " stacked" : ""}`}>
      <div
        className="legend-chip-row"
        role="group"
        aria-label={String(t("legend.title"))}
      >
        {spec.species.map((s, i) => {
          const hidden = !!hiddenStates[i];
          const count = counts?.[s.id]?.[counts[s.id].length - 1];
          const axisShort =
            s.axis === "left"
              ? String(t("legend.axisLeftShort"))
              : String(t("legend.axisRightShort"));
          return (
            // 图例项为可交互按钮（键盘与读屏可操作），
            // aria-pressed 表达「曲线隐藏/显示」状态
            <button
              key={s.id}
              type="button"
              className={`legend-chip${hidden ? " hidden" : ""}`}
              onClick={() => onToggle(i)}
              aria-pressed={hidden}
              title={nameOf(s)}
            >
              <span className="chip-dot" style={{ background: s.color }} aria-hidden="true" />
              {s.icon && (
                <img
                  className="chip-icon"
                  src={s.icon}
                  alt=""
                  aria-hidden="true"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
              <span className="chip-name">{nameOf(s)}</span>
              {/* 实时数量：纯显示，变化频繁故对读屏隐藏，避免干扰 */}
              {count !== undefined && (
                <span className="chip-count" aria-hidden="true">
                  {Math.round(count)}
                </span>
              )}
              <span className="chip-axis" aria-hidden="true">
                {axisShort}
              </span>
            </button>
          );
        })}
      </div>
      <p className="legend-note">※ {note}</p>
    </div>
  );
}
