// ========================= 弹窗通用行为（Esc 关闭 + 焦点圈禁） =========================
// 交互审查（260827）补充：项目内弹窗原先缺少键盘关闭与焦点管理，
// 本 hook 统一提供三个行为：
// 1. 打开时聚焦弹窗容器（tabindex=-1），读屏与键盘用户焦点立即进入弹窗
// 2. Esc 关闭
// 3. Tab 循环圈禁在弹窗内（轻量 focus trap），焦点不会漏到背景内容

import { useEffect, type RefObject } from "react";

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function useModalBehavior(
  open: boolean,
  onClose: () => void,
  containerRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;

    // 初始聚焦容器本身（容器需 tabIndex=-1，且 CSS 不给它可见 focus 描边）
    container.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      // 焦点圈禁：Tab/Shift+Tab 在弹窗内首个/末个可聚焦元素间循环
      const focusables = container.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, containerRef]);
}
