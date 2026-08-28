import type { EcoModelSpec } from "../eco/types";
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
 *  按所属轴分组（组头文字与轴线同色），色点 + 物种名 + 实时数量；
 *  点击切换曲线显隐（aria-pressed）。
 *  「哪个物种对应哪条轴」靠三重颜色呼应传达：组头色 = 轴线色 =
 *  曲线色（均取该轴首个物种的颜色），无需文字说明。 */
export function CustomLegend({ spec, hiddenStates, onToggle, counts }: CustomLegendProps) {
  const { lang, t } = useI18n();
  const nameOf = (s: (typeof spec.species)[number]) => displayName(s.name, s.name_en, lang);

  // 按轴分组；组头与轴线的强调色取该轴首个物种的颜色（与 useEcoChart
  // 的轴 title/ticks 用色规则一致）
  const leftGroup = spec.species
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.axis === "left");
  const rightGroup = spec.species
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.axis === "right");
  const axisAccent = (group: typeof leftGroup) => group[0]?.s.color;

  // 物种较多（>4）时图例从浮层转为图表上方文档流（限高内滚动），
  // 避免浮层大面积遮挡曲线（10 物种实测遮挡绘图区 47%）
  const stacked = spec.species.length > 4;

  const renderGroup = (group: typeof leftGroup, label: string) => {
    if (group.length === 0) return null;
    return (
      <div className="legend-axis-group">
        {/* 组头即轴标签：文字色与对应轴线/曲线同色，建立直觉对应 */}
        <span className="axis-group-label" style={{ color: axisAccent(group) }}>
          {label}
        </span>
        <div className="legend-chip-row" role="group" aria-label={label}>
          {group.map(({ s, i }) => {
            const hidden = !!hiddenStates[i];
            const count = counts?.[s.id]?.[counts[s.id].length - 1];
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
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className={`legend-chips${stacked ? " stacked" : ""}`}>
      {renderGroup(leftGroup, String(t("legend.leftAxis")))}
      {renderGroup(rightGroup, String(t("legend.rightAxis")))}
    </div>
  );
}
