import { useEffect, useState } from "react";
import type { EcoModelSpec, EcoParams, ParamMeta } from "../eco/types";
import { displayName } from "../eco/i18n";
import { useI18n } from "../i18n/LanguageProvider";

interface EcoTunerModalProps {
  spec: EcoModelSpec;
  currentParams: EcoParams;
  open: boolean;
  onClose: () => void;
  onApply: (newParams: EcoParams) => void;
}

export function EcoTunerModal({
  spec,
  currentParams,
  open,
  onClose,
  onApply,
}: EcoTunerModalProps) {
  const { lang } = useI18n();
  const [temp, setTemp] = useState<EcoParams>({ ...currentParams });

  // 打开时同步当前参数
  useEffect(() => {
    if (open) setTemp({ ...currentParams });
  }, [open, currentParams]);

  if (!open) return null;

  const dynamicKeys = Object.entries(spec.paramMeta)
    .filter(([, m]) => m.group === "dynamic")
    .map(([k]) => k);
  const initKeys = Object.entries(spec.paramMeta)
    .filter(([, m]) => m.group === "initial")
    .map(([k]) => k);

  const updateParam = (key: string, val: number) => {
    setTemp((prev) => ({ ...prev, [key]: val }));
  };

  const resetParam = (key: string) => {
    setTemp((prev) => ({ ...prev, [key]: spec.params[key] }));
  };

  const resetAll = () => {
    setTemp({ ...spec.params });
  };

  const apply = () => {
    onApply(temp);
    onClose();
  };

  const renderRow = (key: string, meta: ParamMeta) => {
    const val = temp[key];
    return (
      <div key={key} className="param-row">
        <span className="param-label">
          {displayName(meta.label, meta.label_en, lang)} <small>{key}</small>
        </span>
        <input
          type="range"
          min={meta.min}
          max={meta.max}
          step={meta.step}
          value={val}
          onChange={(e) => updateParam(key, parseFloat(e.target.value))}
        />
        <input
          type="number"
          step={meta.step}
          min={meta.min}
          max={meta.max}
          value={val.toFixed(meta.digits)}
          onChange={(e) => {
            let v = parseFloat(e.target.value);
            if (isNaN(v)) v = meta.min;
            v = Math.min(meta.max, Math.max(meta.min, v));
            updateParam(key, v);
          }}
        />
        <button className="param-reset" onClick={() => resetParam(key)}>
          ↺ 重置
        </button>
      </div>
    );
  };

  return (
    <div id="ecoTunerModal" className="modal-overlay" onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div className="modal-content">
        <div className="modal-header">
          <h2>🎛️ Eco-Tuner - 模型参数自由调节</h2>
          <button className="close-modal-x" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="param-group">
            <h3>📈 模型动力学参数</h3>
            {dynamicKeys.map((k) => renderRow(k, spec.paramMeta[k]))}
          </div>
          <div className="param-group">
            <h3>🌱 初始种群数量</h3>
            {initKeys.map((k) => renderRow(k, spec.paramMeta[k]))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="modal-btn danger" onClick={resetAll}>
            ⟳ 重置所有参数为默认
          </button>
          <div style={{ display: "flex", gap: 12 }}>
            <button className="modal-btn secondary" onClick={onClose}>
              取消
            </button>
            <button className="modal-btn primary" onClick={apply}>
              ✓ 应用并重置模拟
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
