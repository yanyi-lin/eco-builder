import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundaryI18n } from "./components/ErrorBoundary";
import { LanguageProvider } from "./i18n/LanguageProvider";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundaryI18n>
      {/* 语言上下文：全站文案与 AI 默认语言（L3）依赖 */}
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </ErrorBoundaryI18n>
  </StrictMode>,
);
