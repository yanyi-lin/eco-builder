import { useEffect, useRef, useState } from "react";
import type { EcoModelSpec } from "../eco/types";
import { DISTURB_PERCENTS } from "../eco/constants";
import { displayName } from "../eco/i18n";
import { useI18n } from "../i18n/LanguageProvider";

interface DisturbPanelProps {
  spec: EcoModelSpec;
  onDisturb: (speciesId: string, percent: number) => void;
  /** 桌面侧栏形态：true 时渲染为 workbench 左列（侧栏 / 轨道），
   *  开合由 App 的 railOpen 控制；false 时为 deck 内文档流卡片（移动端）。 */
  rail?: boolean;
  railOpen?: boolean;
  onToggleRail?: () => void;
}

/** 干预开关排（扰动面板）：每行 = 物种色标 + 名称 + 三档减百分步进钮。
 *  触发后该行播放一次脉冲动画，强化「干预 → 系统响应」的教学叙事
 *  （prefers-reduced-motion 下自动禁用，见 styles.css 全局覆盖）。
 *  三种形态：
 *  - 文档流卡片（默认/移动端）：面板可折叠，物种行区限高内部滚动；
 *  - 展开侧栏（桌面 rail）：workbench 左列全高面板，滚动区弹性填满；
 *  - 收起轨道（桌面 rail）：52px 竖排标签轨 + 物种色点列，整条可点展开。
 *  滚动区溢出时底部渐隐（.overflowing），提示「下方还有物种行」。 */
export function DisturbPanel({
  spec,
  onDisturb,
  rail = false,
  railOpen = true,
  onToggleRail,
}: DisturbPanelProps) {
  const { lang, t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const [pulsingId, setPulsingId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // 滚动区内容溢出 → 底部渐隐提示（多物种模型下可见）
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // 距底部超过 1px 即视为"还有内容"；滚到底后渐隐消失
    const check = () =>
      setOverflowing(el.scrollHeight - el.scrollTop > el.clientHeight + 1);
    check();
    // 尺寸变化（折叠/窗口/物种增减）与滚动都重新检测
    const ro = new ResizeObserver(check);
    ro.observe(el);
    el.addEventListener("scroll", check, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", check);
    };
    // collapsed/railOpen（形态与折叠影响容器高度）、物种数（内容高度）变化时重测
  }, [collapsed, rail, railOpen, spec.species.length]);

  const handleDisturb = (speciesId: string, percent: number) => {
    onDisturb(speciesId, percent);
    setPulsingId(speciesId);
    if (timerRef.current) clearTimeout(timerRef.current);
    // 动画时长与 CSS keyframes interrupt-pulse 保持一致（0.7s）
    timerRef.current = setTimeout(() => setPulsingId(null), 700);
  };

  /** 面板主体：物种行滚动区 + 说明。三种形态共用。 */
  const body = (
    <>
      {/* 物种行滚动区：文档流形态限高约 3 行，侧栏形态弹性填满（styles.css），
          溢出时底部渐隐提示还有更多 */}
      <div
        ref={scrollRef}
        className={`interrupt-scroll${overflowing ? " overflowing" : ""}`}
      >
        {spec.species.map((s) => {
          const name = displayName(s.name, s.name_en, lang);
          return (
            <div
              key={s.id}
              className={`interrupt-row${pulsingId === s.id ? " pulse" : ""}`}
            >
              <span className="interrupt-label">
                <i className="dot" style={{ background: s.color }} aria-hidden="true" />
                {name}
              </span>
              <div className="step-btns" role="group" aria-label={name}>
                {DISTURB_PERCENTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="step-btn"
                    onClick={() => handleDisturb(s.id, p)}
                    aria-label={String(t("disturb.reduceAria"))
                      .replace("{species}", name)
                      .replace("{percent}", String(Math.round(p * 100)))}
                  >
                    -{Math.round(p * 100)}%
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="interrupt-note">{t("disturb.note")}</p>
    </>
  );

  /* ---- 桌面 rail 形态 ---- */
  if (rail) {
    // 收起：52px 竖排标签轨（整条可点展开），附物种色点列提示面板内容
    if (!railOpen) {
      return (
        <aside className="interrupt-rail" aria-hidden={false}>
          <button
            type="button"
            className="rail-toggle"
            onClick={onToggleRail}
            aria-expanded={false}
            aria-controls="interrupt-body"
            title={String(t("disturb.expand"))}
          >
            <span className="rail-label">{t("disturb.shortTitle")}</span>
            {/* 物种色点列：轨道上即能感知面板里有哪几个物种 */}
            <span className="rail-dots" aria-hidden="true">
              {spec.species.map((s) => (
                <i key={s.id} style={{ background: s.color }} />
              ))}
            </span>
          </button>
        </aside>
      );
    }
    // 展开：workbench 左列全高侧栏（头部 + 弹性滚动区 + 说明）
    return (
      <aside className="interrupt-rail-panel">
        <header className="interrupt-side-head">
          <span className="interrupt-title">{t("disturb.shortTitle")}</span>
          <button
            type="button"
            className="icon-btn sm"
            onClick={onToggleRail}
            aria-expanded={true}
            aria-controls="interrupt-body"
            aria-label={String(t("disturb.collapse"))}
            title={String(t("disturb.collapse"))}
          >
            {/* 收起方向朝左（面板在左侧栏） */}
            <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
              <path
                d="M7.5 2.5L4 6l3.5 3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </header>
        <div id="interrupt-body" className="interrupt-side-body">
          {body}
        </div>
      </aside>
    );
  }

  /* ---- 文档流卡片形态（默认 / 移动端）---- */
  return (
    <section className="interrupt">
      {/* 标题栏即折叠开关，chevron 指示开合方向 */}
      <button
        type="button"
        className="interrupt-head"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
        aria-controls="interrupt-body"
        title={collapsed ? String(t("disturb.expand")) : String(t("disturb.collapse"))}
      >
        <span className="interrupt-title">{t("disturb.title")}</span>
        <svg
          className="chev"
          viewBox="0 0 16 16"
          aria-hidden="true"
          focusable="false"
          width="14"
          height="14"
        >
          <path
            d="M3 6l5 5 5-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <div id="interrupt-body" className="interrupt-body" hidden={collapsed}>
        {body}
      </div>
    </section>
  );
}
