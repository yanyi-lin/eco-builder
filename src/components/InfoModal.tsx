import { useEffect, useState } from "react";
import { useI18n } from "../i18n/LanguageProvider";

interface InfoModalProps {
  open: boolean;
  onClose: () => void;
}

/** 项目信息弹窗（"i" 按钮）：介绍 + 制作者 + 鸣谢入口 */
export function InfoModal({ open, onClose }: InfoModalProps) {
  const { t } = useI18n();
  const [showCredits, setShowCredits] = useState(false);

  // 关闭主窗口时重置鸣谢子窗口状态，避免下次打开残留
  useEffect(() => {
    if (!open) setShowCredits(false);
  }, [open]);

  if (!open) return null;
  return (
    <>
      <div
        id="infoModal"
        className="modal-overlay"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="modal-content">
          <div className="info-title">{t("info.title")}</div>
          <div className="info-desc">
            <p>
              <strong>{t("info.textbookTitle")}</strong>
              <br />
              {t("info.textbookContent")}
            </p>
            <p>{t("info.purpose")}</p>
            <p>
              <strong>{t("info.assistantTitle")}</strong>
              <br />
              {t("info.assistantDesc")}
            </p>
          </div>
          <div className="info-authors">
            <div className="authors-label">{t("info.authorsLabel")}</div>
            <div className="author-names">
              <span>{t("info.authorsName")}</span>
            </div>
          </div>
          <div className="modal-footer">
            <button className="modal-btn secondary" onClick={onClose}>
              {t("info.close")}
            </button>
            <button
              className="modal-btn primary"
              onClick={() => setShowCredits(true)}
            >
              {t("info.credits")}
            </button>
          </div>
        </div>
      </div>
      {showCredits && <CreditsModal onClose={() => setShowCredits(false)} />}
    </>
  );
}

/** 鸣谢弹窗：贡献者 + 开源/数据支持（嵌套在主窗口之上，z-index 更高） */
function CreditsModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  return (
    <div
      className="modal-overlay credits-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-content credits-content">
        <div className="info-title">{t("credits.title")}</div>
        <div className="credits-item">
          <span className="credit-name">{t("credits.liuzimuName")}</span>
          <br />
          {t("credits.liuzimuDesc")}
        </div>
        <div className="credits-section-title">{t("credits.opensourceTitle")}</div>
        <div className="credits-item">
          {t("credits.vercelAi")}
        </div>
        <div className="credits-item">
          {t("credits.react")}
        </div>
        <div className="credits-item">
          {t("credits.vite")}
        </div>
        <div className="credits-item">
          {t("credits.chartjs")}
        </div>
        <div className="credits-item">
          {t("credits.express")}
        </div>
        <div className="credits-item">
          {t("credits.gbif")}
        </div>
        <div className="credits-item">
          {t("credits.globi")}
        </div>
        <div className="credits-note">
          {t("credits.note")}
        </div>
        <div className="modal-footer">
          <button className="modal-btn secondary" onClick={onClose}>
            {t("credits.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
