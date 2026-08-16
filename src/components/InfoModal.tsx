import { useEffect, useState } from "react";

interface InfoModalProps {
  open: boolean;
  onClose: () => void;
}

/** 项目信息弹窗（"i" 按钮）：介绍 + 制作者 + 鸣谢入口 */
export function InfoModal({ open, onClose }: InfoModalProps) {
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
          <div className="info-title">生态学演示器</div>
          <div className="info-desc">
            <p>
              <strong>教材依据</strong>
              <br />
              普通高中教科书 · 生物学选择性必修2
              <br />
              《生物与环境》
            </p>
            <p>
              <strong>项目定位</strong>
              <br />
              智能体协助的生态系统构建工具
            </p>
            <p>
              <strong>AI 助手</strong>
              <br />
              右侧 AI 抽屉支持自然语言控制模拟与构建模型：
              <br />
              读取/设置种群、启停/重置，或构建森林等任意生态模型
            </p>
          </div>
          <div className="info-authors">
            <div className="authors-label">制作者</div>
            <div className="author-names">
              <span>林炎逸</span>
            </div>
          </div>
          <div className="modal-footer">
            <button className="modal-btn secondary" onClick={onClose}>
              关闭
            </button>
            <button
              className="modal-btn primary"
              onClick={() => setShowCredits(true)}
            >
              鸣谢
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
  return (
    <div
      className="modal-overlay credits-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-content credits-content">
        <div className="info-title">鸣谢</div>
        <div className="credits-item">
          <span className="credit-name">刘子木</span>
          <br />
          提供 AI 助手交互的想法
        </div>
        <div className="credits-section-title">开源与数据支持</div>
        <div className="credits-item">
          <span className="credit-name">Vercel AI SDK</span> — AI 聊天与工具调用框架
        </div>
        <div className="credits-item">
          <span className="credit-name">React</span> — 前端 UI 框架
        </div>
        <div className="credits-item">
          <span className="credit-name">Vite</span> — 构建工具
        </div>
        <div className="credits-item">
          <span className="credit-name">Chart.js</span> — 生态曲线图表
        </div>
        <div className="credits-item">
          <span className="credit-name">Express</span> — Node.js 后端框架
        </div>
        <div className="credits-item">
          <span className="credit-name">GBIF</span> — 物种分类数据
        </div>
        <div className="credits-item">
          <span className="credit-name">GloBI</span> — 物种交互数据
        </div>
        <div className="credits-note">
          GBIF 与 GloBI 为开源生态数据平台，本工具的物种与交互查询依赖其数据。
        </div>
        <div className="modal-footer">
          <button className="modal-btn secondary" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
