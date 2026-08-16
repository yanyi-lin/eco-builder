// ========================= 语言基础设施（LanguageProvider + useI18n） =========================
// BILINGUAL-PLAN L0。
// - 无 Provider 时默认 zh 且不抛错（jsdom 测试裸渲染安全）
// - 初始语言优先级：URL ?lang= → localStorage 记忆 → navigator.language → zh
// - 切换按钮同步 history.replaceState（防 ?lang= 覆盖"点了没反应"，审查报告 1 的坑）
// - localStorage 读写均 try/catch（隐私模式抛异常降级）

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { messages, type Lang, type MessageKey } from "./messages";

const STORAGE_KEY = "eco-builder-lang";

export interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** 取当前语言文案（key 编译期校验） */
  t: (key: MessageKey) => ReactNode;
}

/** 无 Provider 兜底：zh 语言 + 中文文案（不抛错；测试裸渲染安全） */
const I18nContext = createContext<I18nContextValue>({
  lang: "zh",
  setLang: () => {},
  t: (key) => (messages.zh as Record<string, ReactNode>)[key] ?? key,
});

/** 初始语言：URL ?lang= → localStorage → navigator.language → zh */
function detectInitialLang(): Lang {
  try {
    const urlLang = new URLSearchParams(window.location.search).get("lang");
    if (urlLang === "zh" || urlLang === "en") return urlLang;
  } catch {
    /* ignore */
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    /* ignore */
  }
  try {
    return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
  } catch {
    /* ignore */
  }
  return "zh";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitialLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* 隐私模式等：记忆失败可接受 */
    }
    // 同步 URL 参数，防止下次刷新被 ?lang= 旧值覆盖
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("lang", next);
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (key: MessageKey): ReactNode => (messages[lang] as Record<string, ReactNode>)[key] ?? key,
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
