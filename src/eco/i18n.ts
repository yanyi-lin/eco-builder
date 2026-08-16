// ========================= 数据层双语工具 =========================
// BILINGUAL-PLAN L1：可选 en 字段 + displayName 回退。
// 规则：英文界面且存在 en 值 → 用 en；否则回退中文原文。
// 动态构建的模型（用户任意输入）无 en 字段，天然回退原文（红线：动态名保留原文）。

import type { Lang } from "../i18n/messages";

/**
 * 按当前语言取显示名：lang=en 且提供 en 值时用英文，否则用中文原文。
 * @param zh 中文原文（必填）
 * @param en 英文值（可选）
 */
export function displayName(zh: string, en: string | undefined, lang: Lang): string {
  return lang === "en" && en ? en : zh;
}
