import { MODELS, DEFAULT_MODEL_ID } from "../eco/models";
import { useI18n } from "../i18n/LanguageProvider";

interface ModelSelectorProps {
  value: string;
  onChange: (id: string) => void;
  /** 禁用交互（历史遗留功能隐藏用） */
  disabled?: boolean;
}

/** 模型选择器（历史遗留，默认隐藏保留扩展位） */
export function ModelSelector({ value, onChange, disabled }: ModelSelectorProps) {
  const { t } = useI18n();
  return (
    <div
      className={`model-selector${disabled ? " model-selector-hidden" : ""}`}
      title={String(t("model.selectLabel"))}
    >
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={String(t("model.selectLabel"))}
        disabled={disabled}
      >
        {Object.values(MODELS).map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      {value === DEFAULT_MODEL_ID && null}
    </div>
  );
}
