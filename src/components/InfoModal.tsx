import { useRef } from "react";
import { useI18n } from "../i18n/LanguageProvider";
import { useModalBehavior } from "./modalBehavior";

interface InfoModalProps {
  open: boolean;
  onClose: () => void;
}

/** 项目信息弹窗（"i" 按钮）：定位语与使用说明 */
export function InfoModal({ open, onClose }: InfoModalProps) {
  const { t } = useI18n();
  const contentRef = useRef<HTMLDivElement | null>(null);

  // Esc 关闭 + 焦点圈禁（读屏/键盘用户可完整操作弹窗）
  useModalBehavior(open, onClose, contentRef);

  if (!open) return null;
  return (
    <div
      id="infoModal"
      className="overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={contentRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="infoModalTitle"
        tabIndex={-1}
      >
        <header className="dialog-head">
          <h2 id="infoModalTitle">{t("info.title")}</h2>
        </header>
        <div className="dialog-body">
          <p className="info-purpose">
            <strong>{t("info.purpose")}</strong>
            <br />
            {t("info.tagline")}
          </p>
        </div>
        <footer className="dialog-foot">
          <div className="foot-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              {t("info.close")}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
