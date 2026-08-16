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
  const { lang } = useI18n();

  return (
    <div className="builder-panel">
      <div className="builder-section">
        <h3>物种 ({state.species.length})</h3>
        {state.species.length === 0 ? (
          <p className="empty-hint">还没有物种。在右侧聊天中告诉 AI 你想模拟什么。</p>
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
                  {sp.deathRate && <span className="tag">死亡率</span>}
                </div>
                <button
                  className="remove-btn"
                  onClick={() => removeSpecies(sp.id)}
                  title="移除"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="builder-section">
        <h3>关系 ({state.relations.length})</h3>
        {state.relations.length === 0 ? (
          <p className="empty-hint">还没有关系。让 AI 帮你定义物种间的关系。</p>
        ) : (
          <div className="relation-list">
            {state.relations.map((rel, i) => {
              let label = "";
              if (rel.type === "predation") {
                label = `${rel.prey} -> ${rel.predator} (捕食)`;
              } else if (rel.type === "competition") {
                label = `${rel.species1} <-> ${rel.species2} (竞争)`;
              } else if (rel.type === "mutualism") {
                label = `${rel.species1} <-> ${rel.species2} (互利)`;
              }
              return (
                <div key={i} className="relation-item">
                  <span>{label}</span>
                  <button
                    className="remove-btn"
                    onClick={() => removeRelation(i)}
                    title="移除"
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
        <h3>参数</h3>
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
