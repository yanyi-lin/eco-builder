// @vitest-environment jsdom
// 语言基础设施测试（BILINGUAL-PLAN L0）：
// - 无 Provider 默认 zh 不抛错（jsdom 测试裸渲染安全底线）
// - Provider 内切换语言生效
// - localStorage 记忆
// - URL ?lang= 优先级（覆盖 localStorage）
// 注意：jsdom 的 navigator.language 是 en-US，测试用 localStorage 显式控制初始值
//（审查报告：自动检测仅首次且无记忆时生效）。
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { LanguageProvider, useI18n } from "../src/i18n/LanguageProvider";

const STORAGE_KEY = "eco-builder-lang";

function Probe() {
  const { lang, t, setLang } = useI18n();
  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <span data-testid="title">{String(t("app.title.build"))}</span>
      <button onClick={() => setLang(lang === "zh" ? "en" : "zh")}>switch</button>
    </div>
  );
}

describe("useI18n / LanguageProvider", () => {
  beforeEach(() => {
    // 模拟"已记忆中文"（避免 jsdom en-US 翻转默认值）
    localStorage.setItem(STORAGE_KEY, "zh");
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
    history.replaceState(null, "", "/");
  });

  it("无 Provider 时默认 zh 且不抛错", () => {
    const { getByTestId } = render(<Probe />);
    expect(getByTestId("lang").textContent).toBe("zh");
    expect(getByTestId("title").textContent).toBe("生态模型构建器");
  });

  it("Provider 内切换语言生效，文案随之变化", () => {
    const { getByTestId, getByText } = render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(getByTestId("lang").textContent).toBe("zh");
    expect(getByTestId("title").textContent).toBe("生态模型构建器");
    act(() => getByText("switch").click());
    expect(getByTestId("lang").textContent).toBe("en");
    expect(getByTestId("title").textContent).toBe("Eco Model Builder");
  });

  it("localStorage 记忆：重渲染后保持语言", () => {
    const first = render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    act(() => first.getByText("switch").click());
    expect(first.getByTestId("lang").textContent).toBe("en");
    cleanup();

    const second = render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(second.getByTestId("lang").textContent).toBe("en");
  });

  it("URL ?lang= 优先于 localStorage", () => {
    history.replaceState(null, "", "/?lang=en");
    // localStorage 记的是 zh，但 URL 应胜出
    const { getByTestId } = render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(getByTestId("lang").textContent).toBe("en");
  });

  it("切换按钮同步 URL 参数（防 ?lang= 覆盖）", () => {
    const { getByText } = render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    act(() => getByText("switch").click());
    expect(window.location.search).toContain("lang=en");
  });
});
