import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
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
            <div className="error-boundary-title">😵 页面出错了</div>
            <div className="error-boundary-desc">
              应用遇到了一个未预期的错误，可能来自图表渲染或 AI 消息解析。
            </div>
            <div className="error-boundary-msg">{this.state.message}</div>
            <button className="error-boundary-btn" onClick={this.handleReload}>
              重新加载
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
