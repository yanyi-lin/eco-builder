import type { UseEcoBuilder } from "../eco/useEcoBuilder";
import { displayName } from "../eco/i18n";
import { useI18n } from "../i18n/LanguageProvider";

interface BuilderPanelProps {
  builder: UseEcoBuilder;
}

/**
 * 构建模式下的主面板。
 * 显示当前构建的物种、关系和参数，供用户查看和微调。
 */
export function BuilderPanel({ builder }: BuilderPanelProps) {
  const { state, removeSpecies, removeRelation } = builder;
  const { lang, t } = useI18n();

  // 关系展示：捕食用单向箭头，竞争/互利用双向箭头（比原 -> 与 <-> 更可读）
  const relationLabel = (rel: (typeof state.relations)[number]): string => {
    const typeOf =
      rel.type === "predation"
        ? String(t("builder.relationPredation"))
        : rel.type === "competition"
          ? String(t("builder.relationCompetition"))
          : String(t("builder.relationMutualism"));
    if (rel.type === "predation") {
      return `${rel.prey} → ${rel.predator}（${typeOf}）`;
    }
    return `${rel.species1} ↔ ${rel.species2}（${typeOf}）`;
  };

  // 关系列表稳定 key：addRelation 已按「类型+物种对」去重，组合键天然唯一，
  // 避免原实现用数组索引做 key 导致删除中间项时 React 复用错节点
  const relationKey = (rel: (typeof state.relations)[number]): string => {
    if (rel.type === "predation") return `${rel.type}-${rel.prey}-${rel.predator}`;
    return `${rel.type}-${rel.species1}-${rel.species2}`;
  };

  return (
    <div className="builder-panel">
      <div className="builder-section">
        <h3>{t("builder.species")} ({state.species.length})</h3>
        {state.species.length === 0 ? (
          <p className="empty-hint">{t("builder.emptySpecies")}</p>
        ) : (
          <div className="species-list">
            {state.species.map(sp => (
              <div key={sp.id} className="species-card" style={{ borderLeftColor: sp.color }}>
                <div className="species-info">
                  <strong>{displayName(sp.name, sp.name_en, lang)}</strong>
                  <span className="species-id">({sp.id})</span>
                </div>
                <div className="species-meta">
                  {sp.hasLogistic && <span className="tag">Logistic</span>}
                  {sp.deathRate && <span className="tag">{t("builder.tagDeathRate")}</span>}
                </div>
                <button
                  className="remove-btn"
                  onClick={() => removeSpecies(sp.id)}
                  aria-label={String(t("builder.removeSpeciesAria")).replace("{species}", displayName(sp.name, sp.name_en, lang))}
                  title={String(t("builder.remove"))}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="builder-section">
        <h3>{t("builder.relations")} ({state.relations.length})</h3>
        {state.relations.length === 0 ? (
          <p className="empty-hint">{t("builder.emptyRelations")}</p>
        ) : (
          <div className="relation-list">
            {state.relations.map((rel) => {
              const label = relationLabel(rel);
              return (
                <div key={relationKey(rel)} className="relation-item">
                  <span>{label}</span>
                  <button
                    className="remove-btn"
                    onClick={() => removeRelation(state.relations.indexOf(rel))}
                    aria-label={String(t("builder.removeRelationAria")).replace("{relation}", label)}
                    title={String(t("builder.remove"))}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="builder-section">
        <h3>{t("builder.params")}</h3>
        <div className="params-grid">
          {Object.entries(state.params).map(([key, value]) => {
            const meta = state.paramMeta[key];
            // 英文界面优先展示 label_en（缺省退化为中文 label），与模型参数面板行为一致
            const zhLabel = meta?.label ?? key;
            return (
              <div key={key} className="param-item">
                {/* 优先展示 paramMeta 的人类可读标签（如「内禀增长率」），
                    键名仅作辅助，方便与 AI 指令中的参数名对照 */}
                <span className="param-key" title={key}>
                  {displayName(zhLabel, meta?.label_en ?? zhLabel, lang)}
                </span>
                <span className="param-value">{typeof value === "number" ? value.toFixed(4) : value}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
