// ========================= 双语文案表（zh/en） =========================
// BILINGUAL-PLAN L0。约束：
// - zh/en 的 key 严格对齐（satisfies Record<Lang, ...> 编译期保证，漏 key 会 typecheck 报错）
// - 值为 ReactNode（可含 JSX/链接），避免 HTML 字符串带来的 XSS 面
// - 文案随层扩充：L0 先放基础设施所需 key，L2 补齐全部 UI 文案

import type { ReactNode } from "react";

export type Lang = "zh" | "en";

export const messages = {
  zh: {
    /** 语言切换按钮：中文界面显示 EN（提示可切英文） */
    "lang.toggle": "EN",
    /** 构建模式页头标题 */
    "app.title.build": "生态模型构建器",
    /** 模拟模式无模型名时的兜底标题 */
    "app.title.simulate": "生态模型构建器",
  },
  en: {
    "lang.toggle": "中",
    "app.title.build": "Eco Model Builder",
    "app.title.simulate": "Eco Model Builder",
  },
} satisfies Record<Lang, Record<string, ReactNode>>;

/** 文案表 key 类型（zh/en 同构） */
export type MessageKey = keyof (typeof messages)["zh"];
