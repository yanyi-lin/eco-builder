import type { CSSProperties } from "react";
import type { UseEcoBuilder } from "../eco/useEcoBuilder";
import { displayName } from "../eco/i18n";
import { useI18n } from "../i18n/LanguageProvider";

interface BuilderPanelProps {
  builder: UseEcoBuilder;
}

/** 移除按钮（行内小号 ghost，×图标） */
function RemoveButton({ label, title, onRemove }: { label: string; title: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      className="icon-btn sm"
      onClick={onRemove}
      aria-label={label}
      title={title}
    >
      <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
        <path
          d="M2.5 2.5l7 7m0-7l-7 7"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

/**
 * 构建模式的构建台：物种、关系、参数三个分区卡片，
 * 供用户查看当前模型组成并手动微调（增删由 AI 工具驱动）。
 */
export function BuilderPanel({ builder }: BuilderPanelProps) {
  const { state, removeSpecies, removeRelation } = builder;
  const { lang, t } = useI18n();

  // 关系展示拆为「类型标签 + 物种流向」：捕食单向箭头，竞争/互利双向箭头
  const relationTypeOf = (rel: (typeof state.relations)[number]): string =>
    rel.type === "predation"
      ? String(t("builder.relationPredation"))
      : rel.type === "competition"
        ? String(t("builder.relationCompetition"))
        : String(t("builder.relationMutualism"));

  const relationFlow = (rel: (typeof state.relations)[number]): string =>
    rel.type === "predation"
      ? `${rel.prey} → ${rel.predator}`
      : `${rel.species1} ↔ ${rel.species2}`;

  // 完整关系文案（供 aria-label 与 title）
  const relationLabel = (rel: (typeof state.relations)[number]): string =>
    `${relationFlow(rel)}（${relationTypeOf(rel)}）`;

  // 关系列表稳定 key：addRelation 已按「类型+物种对」去重，组合键天然唯一，
  // 避免用数组索引做 key 导致删除中间项时 React 复用错节点
  const relationKey = (rel: (typeof state.relations)[number]): string => {
    if (rel.type === "predation") return `${rel.type}-${rel.prey}-${rel.predator}`;
    return `${rel.type}-${rel.species1}-${rel.species2}`;
  };

  return (
    <div className="builder">
      {/* 物种分区 */}
      <section className="builder-card">
        <header className="builder-head">
          <h3>{t("builder.species")}</h3>
          <span className="count-badge" aria-label={String(state.species.length)}>
            {state.species.length}
          </span>
        </header>
        {state.species.length === 0 ? (
          <p className="builder-empty">{t("builder.emptySpecies")}</p>
        ) : (
          <ul className="species-list">
            {state.species.map((sp) => (
              <li
                key={sp.id}
                className="species-item"
                // 左侧色脊与曲线色一致（CSS 变量注入，--spine 在 styles.css 消费）
                style={{ "--spine": sp.color } as CSSProperties}
              >
                <div className="species-main">
                  <strong>{displayName(sp.name, sp.name_en, lang)}</strong>
                  <span className="species-id">{sp.id}</span>
                </div>
                <div className="species-tags">
                  {sp.hasLogistic && <span className="tag">Logistic</span>}
                  {sp.deathRate && <span className="tag">{t("builder.tagDeathRate")}</span>}
                </div>
                <RemoveButton
                  label={String(t("builder.removeSpeciesAria")).replace(
                    "{species}",
                    displayName(sp.name, sp.name_en, lang),
                  )}
                  title={String(t("builder.remove"))}
                  onRemove={() => removeSpecies(sp.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 关系分区 */}
      <section className="builder-card">
        <header className="builder-head">
          <h3>{t("builder.relations")}</h3>
          <span className="count-badge" aria-label={String(state.relations.length)}>
            {state.relations.length}
          </span>
        </header>
        {state.relations.length === 0 ? (
          <p className="builder-empty">{t("builder.emptyRelations")}</p>
        ) : (
          <ul className="relation-list">
            {state.relations.map((rel) => {
              const label = relationLabel(rel);
              return (
                <li key={relationKey(rel)} className="relation-item">
                  <span className="rel-type">{relationTypeOf(rel)}</span>
                  <span className="rel-flow">{relationFlow(rel)}</span>
                  <RemoveButton
                    label={String(t("builder.removeRelationAria")).replace("{relation}", label)}
                    title={String(t("builder.remove"))}
                    onRemove={() => removeRelation(state.relations.indexOf(rel))}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 参数分区（mono 网格：人类可读标签 + 数值） */}
      <section className="builder-card">
        <header className="builder-head">
          <h3>{t("builder.params")}</h3>
        </header>
        <div className="param-grid">
          {Object.entries(state.params).map(([key, value]) => {
            const meta = state.paramMeta[key];
            // 英文界面优先展示 label_en（缺省退化为中文 label），与调参面板行为一致
            const zhLabel = meta?.label ?? key;
            return (
              <div key={key} className="param-cell">
                {/* 优先展示 paramMeta 的人类可读标签（如「内禀增长率」），
                    键名仅作辅助，方便与 AI 指令中的参数名对照 */}
                <span className="param-label" title={key}>
                  {displayName(zhLabel, meta?.label_en ?? zhLabel, lang)}
                </span>
                <span className="param-value">
                  {typeof value === "number" ? value.toFixed(4) : value}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
