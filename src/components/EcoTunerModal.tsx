import { useEffect, useRef, useState } from "react";
import type { EcoModelSpec, EcoParams, ParamMeta } from "../eco/types";
import { displayName } from "../eco/i18n";
import { useI18n } from "../i18n/LanguageProvider";
import { useModalBehavior } from "./modalBehavior";

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
  const { lang, t } = useI18n();
  const [temp, setTemp] = useState<EcoParams>({ ...currentParams });
  const contentRef = useRef<HTMLDivElement | null>(null);

  // 打开时同步当前参数
  useEffect(() => {
    if (open) setTemp({ ...currentParams });
  }, [open, currentParams]);

  // Esc 关闭 + 焦点圈禁
  useModalBehavior(open, onClose, contentRef);

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
    const label = displayName(meta.label, meta.label_en, lang);
    return (
      // ParamRow 拆为独立组件：数字输入采用「草稿态」本地 state，
      // 避免原实现（受控 value=val.toFixed(digits)）打断打字
      <ParamRow
        key={key}
        paramKey={key}
        meta={meta}
        value={val}
        label={label}
        resetLabel={String(t("tuner.resetParam"))}
        onChange={(v) => updateParam(key, v)}
        onReset={() => resetParam(key)}
      />
    );
  };

  return (
    <div id="ecoTunerModal" className="modal-overlay" onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div
        ref={contentRef}
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ecoTunerTitle"
        tabIndex={-1}
      >
        <div className="modal-header">
          <h2 id="ecoTunerTitle">{t("tuner.header")}</h2>
          <button className="close-modal-x" onClick={onClose} aria-label={String(t("tuner.closeAria"))}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="param-group">
            <h3>{t("tuner.groupDynamic")}</h3>
            {dynamicKeys.map((k) => renderRow(k, spec.paramMeta[k]))}
          </div>
          <div className="param-group">
            <h3>{t("tuner.groupInitial")}</h3>
            {initKeys.map((k) => renderRow(k, spec.paramMeta[k]))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="modal-btn danger" onClick={resetAll}>
            {t("tuner.resetAll")}
          </button>
          <div style={{ display: "flex", gap: 12 }}>
            <button className="modal-btn secondary" onClick={onClose}>
              {t("tuner.cancel")}
            </button>
            <button className="modal-btn primary" onClick={apply}>
              {t("tuner.apply")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ParamRowProps {
  paramKey: string;
  meta: ParamMeta;
  value: number;
  label: string;
  resetLabel: string;
  onChange: (v: number) => void;
  onReset: () => void;
}

/**
 * 单行参数调节：slider 实时联动 + 数字框草稿态输入。
 * 数字框仅在本行内部维护文本草稿，blur/Enter 时才解析并 clamp 提交，
 * 打字过程（如输入 "0." 的中间态）不会被格式化打断。
 */
function ParamRow({ paramKey, meta, value, label, resetLabel, onChange, onReset }: ParamRowProps) {
  const [draft, setDraft] = useState<string>(() => value.toFixed(meta.digits));
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 外部值变化（slider 拖动 / 重置）时刷新草稿；焦点期间仅 slider 硬变更才覆盖，
  // 避免用户打字被外部同步冲掉
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setDraft(value.toFixed(meta.digits));
    }
  }, [value, meta.digits]);

  // 提交草稿：非法输入回退当前值（并在视觉上恢复），合法输入 clamp 后提交
  const commit = () => {
    const parsed = parseFloat(draft);
    if (isNaN(parsed) || !isFinite(parsed)) {
      setDraft(value.toFixed(meta.digits));
      return;
    }
    const clamped = Math.min(meta.max, Math.max(meta.min, parsed));
    onChange(clamped);
    setDraft(clamped.toFixed(meta.digits));
  };

  const idBase = `param-${paramKey}`;
  return (
    <div className="param-row">
      <label className="param-label" htmlFor={`${idBase}-num`}>
        {label} <small>{paramKey}</small>
      </label>
      <input
        id={`${idBase}-range`}
        type="range"
        min={meta.min}
        max={meta.max}
        step={meta.step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        aria-label={`${label} (${paramKey})`}
      />
      <input
        id={`${idBase}-num`}
        ref={inputRef}
        type="number"
        step={meta.step}
        min={meta.min}
        max={meta.max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            (e.target as HTMLInputElement).blur();
          }
        }}
        aria-label={`${label} (${paramKey})`}
      />
      <button className="param-reset" onClick={onReset} title={resetLabel}>
        {resetLabel}
      </button>
    </div>
  );
}
