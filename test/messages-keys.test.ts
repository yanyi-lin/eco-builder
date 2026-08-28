// i18n key 完整性测试：
// zh 与 en 的 key 集合必须完全一致。MessageKey 类型从 zh 推导，
// en 缺 key 只会在运行时暴露（英文界面显示原始 key），此测试在构建期拦截。
// 背景：legend 说明文字模板化（noteLeft/noteRight/noteToggle/windowNote
// 合并为 legend.note）这类 key 增删改动需要同步两个语言包。
import { describe, it, expect } from "vitest";
import { messages } from "../src/i18n/messages";

describe("messages zh/en key 对齐", () => {
  const zhKeys = Object.keys(messages.zh).sort();
  const enKeys = Object.keys(messages.en).sort();

  it("en 不缺 key", () => {
    const missing = zhKeys.filter((k) => !enKeys.includes(k));
    expect(missing).toEqual([]);
  });

  it("en 不多 key", () => {
    const extra = enKeys.filter((k) => !zhKeys.includes(k));
    expect(extra).toEqual([]);
  });

  it("占位符一致：同 key 的 {n} 类模板占位符在两种语言中相同", () => {
    // 整句模板（如 legend.note）用 {left}/{right}/{n} 占位，
    // 两语言占位符不一致会导致 replace 漏替换、占位符裸露
    for (const key of zhKeys) {
      const zhPlaceholders = extractPlaceholders(String(messages.zh[key as never]));
      const enPlaceholders = extractPlaceholders(String(messages.en[key as never]));
      expect(enPlaceholders.sort(), `key: ${key}`).toEqual(zhPlaceholders.sort());
    }
  });
});

/** 提取 {name} 形式的占位符 */
function extractPlaceholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
}
