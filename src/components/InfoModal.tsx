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
          {/* GitHub 章鱼猫按钮：跳转仓库，无文字说明 */}
          <div className="github-btn-wrap">
            <a
              className="github-btn"
              href="https://github.com/yanyi-lin/eco-builder"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub 仓库"
            >
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
              </svg>
            </a>
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
