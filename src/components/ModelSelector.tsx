import { MODELS, DEFAULT_MODEL_ID } from "../eco/models";

interface ModelSelectorProps {
  value: string;
  onChange: (id: string) => void;
  /** 禁用交互（历史遗留功能隐藏用） */
  disabled?: boolean;
}

export function ModelSelector({ value, onChange, disabled }: ModelSelectorProps) {
  const hasMultiple = Object.keys(MODELS).length > 1;
  return (
    <div className={`model-selector-wrap${disabled ? " model-selector-hidden" : ""}`} title={hasMultiple ? "切换生态模型" : "当前仅一个模型，预留扩展"}>
      <span>🧬</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="选择生态模型"
        disabled={disabled}
      >
        {Object.values(MODELS).map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      {!hasMultiple && <small style={{ opacity: 0.6 }}>·</small>}
      {value === DEFAULT_MODEL_ID && !hasMultiple && null}
    </div>
  );
}
