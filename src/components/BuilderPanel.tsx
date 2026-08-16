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
                  title={String(t("builder.remove"))}
                >
                  x
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
            {state.relations.map((rel, i) => {
              let label = "";
              if (rel.type === "predation") {
                label = `${rel.prey} -> ${rel.predator} (${String(t("builder.relationPredation"))})`;
              } else if (rel.type === "competition") {
                label = `${rel.species1} <-> ${rel.species2} (${String(t("builder.relationCompetition"))})`;
              } else if (rel.type === "mutualism") {
                label = `${rel.species1} <-> ${rel.species2} (${String(t("builder.relationMutualism"))})`;
              }
              return (
                <div key={i} className="relation-item">
                  <span>{label}</span>
                  <button
                    className="remove-btn"
                    onClick={() => removeRelation(i)}
                    title={String(t("builder.remove"))}
                  >
                    x
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
          {Object.entries(state.params).map(([key, value]) => (
            <div key={key} className="param-item">
              <span className="param-key">{key}</span>
              <span className="param-value">{typeof value === "number" ? value.toFixed(4) : value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
