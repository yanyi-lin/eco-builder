import type { EcoModelSpec } from "../eco/types";
import { displayName } from "../eco/i18n";
import { useI18n } from "../i18n/LanguageProvider";

interface CustomLegendProps {
  spec: EcoModelSpec;
  /** 各 dataset 当前 hidden 状态，index 对应 spec.species 顺序 */
  hiddenStates: boolean[];
  onToggle: (index: number) => void;
  /** 各物种实时数量序列（通道内显示最新值，纯显示） */
  counts?: Record<string, number[]>;
}

/** 物种通道带（签名元素）：图例即"记录通道"。
 *  按所属轴分组，组标色 = 该轴首物种色 = 轴线色 = 曲线色，三重呼应传达
 *  「物种 ↔ 轴」对应；每个通道 = 方形色标端子 + 物种名 + 实时计数（mono）。
 *  点击切换曲线显隐（aria-pressed），关闭态端子空心 + 名称划除。 */
export function CustomLegend({ spec, hiddenStates, onToggle, counts }: CustomLegendProps) {
  const { lang, t } = useI18n();
  const nameOf = (s: (typeof spec.species)[number]) => displayName(s.name, s.name_en, lang);

  // 按轴分组；组标强调色取该轴首个物种的颜色（与 useEcoChart 轴用色规则一致）
  const leftGroup = spec.species
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.axis === "left");
  const rightGroup = spec.species
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.axis === "right");
  const axisAccent = (group: typeof leftGroup) => group[0]?.s.color;

  const renderGroup = (group: typeof leftGroup, label: string) => {
    if (group.length === 0) return null;
    return (
      <div className="axis-group">
        {/* 组标即轴标签：文字色与对应轴线/曲线同色 */}
        <span className="axis-tag" style={{ color: axisAccent(group) }}>
          {label}
        </span>
        <div className="channel-row" role="group" aria-label={label}>
          {group.map(({ s, i }) => {
            const hidden = !!hiddenStates[i];
            const count = counts?.[s.id]?.[counts[s.id].length - 1];
            return (
              // 通道为可交互按钮（键盘与读屏可操作），
              // aria-pressed 表达「曲线隐藏/显示」状态
              <button
                key={s.id}
                type="button"
                className={`channel${hidden ? " off" : ""}`}
                onClick={() => onToggle(i)}
                aria-pressed={hidden}
                title={nameOf(s)}
              >
                <span className="punch" style={{ background: s.color }} aria-hidden="true" />
                {s.icon && (
                  <img
                    className="chip-icon"
                    src={s.icon}
                    alt=""
                    width={15}
                    height={15}
                    aria-hidden="true"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                )}
                <span className="channel-name">{nameOf(s)}</span>
                {/* 实时数量：变化频繁，对读屏隐藏避免干扰 */}
                {count !== undefined && (
                  <span className="channel-count" aria-hidden="true">
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
    <div className="channel-strip">
      {renderGroup(leftGroup, String(t("legend.leftAxis")))}
      {renderGroup(rightGroup, String(t("legend.rightAxis")))}
    </div>
  );
}
