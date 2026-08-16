import { Component, type ErrorInfo, type ReactNode } from "react";
import { useI18n } from "../i18n/LanguageProvider";
import type { MessageKey } from "../i18n/messages";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** 双语文案（由外层函数组件注入，class 组件无法用 hook） */
  t: (key: MessageKey) => ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

/**
 * 顶层错误边界：捕获渲染期异常（Chart.js / AI 消息解析等），
 * 避免整个应用白屏崩溃，并提供刷新恢复入口。
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // 生产环境可上报；这里仅保留控制台日志便于排查
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReload = (): void => {
    // 重置错误状态并刷新（避免依赖用户手动 F5）
    this.setState({ hasError: false, message: "" });
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-box">
            <div className="error-boundary-title">{this.props.t("error.title")}</div>
            <div className="error-boundary-desc">
              {this.props.t("error.desc")}
            </div>
            <div className="error-boundary-msg">{this.state.message}</div>
            <button className="error-boundary-btn" onClick={this.handleReload}>
              {this.props.t("error.reload")}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/** 函数包装：在 LanguageProvider 内取 t 注入（class 组件无法使用 hook） */
export function ErrorBoundaryI18n({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return <ErrorBoundary t={t}>{children}</ErrorBoundary>;
}
