// ========================= 双语文案表（zh/en） =========================
// BILINGUAL-PLAN L0/L2。约束：
// - zh/en 的 key 严格对齐（satisfies Record<Lang, ...> 编译期保证）
// - 值为 ReactNode（可含 JSX：<br/>、链接），避免 HTML 字符串 XSS 面
// - 长文案多行用 JSX <br/> 或字符串换行（组件内 CSS 控制 white-space）

import type { ReactNode } from "react";

export type Lang = "zh" | "en";

export const messages = {
  zh: {
    // === 语言切换 ===
    "lang.toggle": "EN",

    // === App 页头 ===
    "app.title.build": "生态模型构建器",
    "app.title.simulate": "生态模型构建器",
    "app.titlePage": "生态模型构建器 | 智能体助手",
    "app.switchToBuild": "构建新模型",
    "app.switchToSimulate": "返回模拟",
    "app.modeBuildBadge": "构建模式",

    // === ChartPanel 控制 ===
    "chart.start": "▶️ 开始",
    "chart.pause": "⏸️ 暂停",
    "chart.reset": "🔄 重置模拟",
    "chart.startSimulation": "▶️ 开始模拟",
    "chart.ecoTuner": "🎛️ Eco-Tuner",
    "chart.ecoTunerTitle": "Eco-Tuner（已禁用）",
    "chart.axisTime": "模拟时间 (相对单位)",
    "chart.tooltipUnit": "个体/面积",

    // === DisturbPanel 扰动 ===
    "disturb.title": "⚡ 生态扰动 (减少种群数量)",
    "disturb.note":
      "点击后即时减少当前种群对应百分比（不低于最小阈值），系统自动调节展现恢复力与周期性",

    // === CustomLegend 图例 ===
    "legend.title": "📊 双Y轴说明 | 点击图例显示/隐藏曲线",
    "legend.iconAlt": "图标",
    "legend.leftAxis": "左轴",
    "legend.rightAxis": "右轴",
    "legend.leftFallback": "左侧",
    "legend.otherFallback": "其他",
    "legend.noteLeft": "物种在左轴，",
    "legend.noteRight": "物种在右轴。",
    "legend.noteToggle": "点击图例可隐藏/显示曲线，再次点击恢复。",

    // === BuilderPanel 构建面板 ===
    "builder.species": "物种",
    "builder.relations": "关系",
    "builder.params": "参数",
    "builder.emptySpecies": "还没有物种。在右侧聊天中告诉 AI 你想模拟什么。",
    "builder.emptyRelations": "还没有关系。让 AI 帮你定义物种间的关系。",
    "builder.tagDeathRate": "死亡率",
    "builder.remove": "移除",
    "builder.relationPredation": "捕食",
    "builder.relationCompetition": "竞争",
    "builder.relationMutualism": "互利",

    // === EcoTunerModal ===
    "tuner.header": "🎛️ Eco-Tuner - 模型参数自由调节",
    "tuner.groupDynamic": "📈 模型动力学参数",
    "tuner.groupInitial": "🌱 初始种群数量",
    "tuner.resetParam": "重置",
    "tuner.resetAll": "重置所有参数为默认",
    "tuner.cancel": "取消",
    "tuner.apply": "应用并重置模拟",

    // === InfoModal / Credits ===
    "info.title": "生态学演示器",
    "info.textbookTitle": "教材依据",
    "info.textbookContent": (
      <>
        普通高中教科书 · 生物学选择性必修2
        <br />
        《生物与环境》
      </>
    ),
    "info.purpose": "智能体协助的生态系统构建工具",
    "info.assistantTitle": "智能体助手",
    "info.assistantDesc": (
      <>
        右侧抽屉支持自然语言控制模拟与构建模型：
        <br />
        读取/设置种群、启停/重置，或构建森林等任意生态模型
      </>
    ),
    "info.authorsLabel": "制作者",
    "info.authorsName": "林炎逸",
    "info.close": "关闭",
    "info.credits": "鸣谢",
    "credits.title": "鸣谢",
    "credits.liuzimuName": "刘子木",
    "credits.liuzimuDesc": "提供 AI 助手交互的想法",
    "credits.opensourceTitle": "开源与数据支持",
    "credits.vercelAi": "Vercel AI SDK — AI 聊天与工具调用框架",
    "credits.react": "React — 前端 UI 框架",
    "credits.vite": "Vite — 构建工具",
    "credits.chartjs": "Chart.js — 生态曲线图表",
    "credits.express": "Express — Node.js 后端框架",
    "credits.gbif": "GBIF — 物种分类数据",
    "credits.globi": "GloBI — 物种交互数据",
    "credits.note": "GBIF 与 GloBI 为开源生态数据平台，本工具的物种与交互查询依赖其数据。",
    "credits.close": "关闭",

    // === AgentChatDrawer ===
    "drawer.title": "智能体助手",
    "drawer.expand": "展开智能体助手",
    "drawer.collapse": "收起智能体助手",
    "drawer.collapsedLabel": "智能体",
    "drawer.expandedLabel": "智能体助手",
    "drawer.statusThinking": "思考中...",
    "drawer.statusError": "出错",
    "drawer.statusReady": "就绪",

    // === MessageList / MessageInput ===
    "chat.emptyIntro": "我是智能体助手。",
    "chat.emptyGuide": "可以用自然语言让我：",
    "chat.emptyRead": "· 读取当前种群数量",
    "chat.emptySet": "· 设置某物种数量",
    "chat.emptyControl": "· 启动 / 暂停 / 重置模拟",
    "chat.emptyBuild":
      "· 切换到【构建模式】搭建全新的生态模型（如\"构建森林生态系统\"）",
    "chat.emptyTry": "试试说：「读取当前种群，然后把某个物种的数量设为 30」",
    "chat.inputPlaceholder": "输入指令，Enter 发送 / Shift+Enter 换行",
    "chat.inputThinking": "AI 正在思考...",
    "chat.send": "发送",

    // === ErrorBoundary ===
    "error.title": "😵 页面出错了",
    "error.desc": "应用遇到了一个未预期的错误，可能来自图表渲染或 AI 消息解析。",
    "error.reload": "重新加载",

    // === ModelSelector ===
    "model.switchTitle": "切换生态模型",
    "model.singleTitle": "当前仅一个模型，预留扩展",
    "model.selectLabel": "选择生态模型",
    "app.githubRepo": "GitHub 仓库",
    "app.modelInfo": "模型说明",
  },
  en: {
    "lang.toggle": "中",

    "app.title.build": "Eco Model Builder",
    "app.title.simulate": "Eco Model Builder",
    "app.titlePage": "Eco Model Builder | AI Assistant",
    "app.switchToBuild": "Build New Model",
    "app.switchToSimulate": "Back to Simulation",
    "app.modeBuildBadge": "Build Mode",

    "chart.start": "▶️ Start",
    "chart.pause": "⏸️ Pause",
    "chart.reset": "🔄 Reset",
    "chart.startSimulation": "▶️ Start Simulation",
    "chart.ecoTuner": "🎛️ Eco-Tuner",
    "chart.ecoTunerTitle": "Eco-Tuner (disabled)",
    "chart.axisTime": "Simulation time (relative units)",
    "chart.tooltipUnit": "individuals/area",

    "disturb.title": "⚡ Ecological Disturbance (reduce population)",
    "disturb.note":
      "Instantly reduces the population by the selected percentage (not below the minimum threshold); the system self-regulates to show resilience and periodicity",

    "legend.title": "📊 Dual Y-axis guide | Click legend to toggle curves",
    "legend.iconAlt": "icon",
    "legend.leftAxis": "Left axis",
    "legend.rightAxis": "Right axis",
    "legend.leftFallback": "left-side",
    "legend.otherFallback": "other",
    "legend.noteLeft": " species on left axis, ",
    "legend.noteRight": " species on right axis.",
    "legend.noteToggle": "Click legend to hide/show curves; click again to restore.",

    "builder.species": "Species",
    "builder.relations": "Relations",
    "builder.params": "Parameters",
    "builder.emptySpecies": "No species yet. Tell the AI in the chat what you want to simulate.",
    "builder.emptyRelations": "No relations yet. Ask the AI to define relationships between species.",
    "builder.tagDeathRate": "Death rate",
    "builder.remove": "Remove",
    "builder.relationPredation": "Predation",
    "builder.relationCompetition": "Competition",
    "builder.relationMutualism": "Mutualism",

    "tuner.header": "🎛️ Eco-Tuner - Free parameter tuning",
    "tuner.groupDynamic": "📈 Model dynamics",
    "tuner.groupInitial": "🌱 Initial populations",
    "tuner.resetParam": "Reset",
    "tuner.resetAll": "Reset all parameters to default",
    "tuner.cancel": "Cancel",
    "tuner.apply": "Apply & reset simulation",

    "info.title": "Ecology Demonstrator",
    "info.textbookTitle": "Based on textbook",
    "info.textbookContent": (
      <>
        High school textbook · Biology Selective Compulsory 2
        <br />
        Organisms and Environment
      </>
    ),
    "info.purpose": "AI-assisted ecosystem builder",
    "info.assistantTitle": "AI Assistant",
    "info.assistantDesc": (
      <>
        The drawer on the right lets you control simulation and build models in natural language:
        <br />
        read/set populations, start/pause/reset, or build any ecosystem model (e.g. a forest).
      </>
    ),
    "info.authorsLabel": "Author",
    "info.authorsName": "Yanyi Lin",
    "info.close": "Close",
    "info.credits": "Credits",
    "credits.title": "Credits",
    "credits.liuzimuName": "Liu Zimu",
    "credits.liuzimuDesc": "Contributed the idea of AI assistant interaction",
    "credits.opensourceTitle": "Open source & data support",
    "credits.vercelAi": "Vercel AI SDK — AI chat & tool-calling framework",
    "credits.react": "React — frontend UI framework",
    "credits.vite": "Vite — build tool",
    "credits.chartjs": "Chart.js — ecology curves charting",
    "credits.express": "Express — Node.js backend framework",
    "credits.gbif": "GBIF — species taxonomy data",
    "credits.globi": "GloBI — species interaction data",
    "credits.note":
      "GBIF and GloBI are open ecology data platforms that power this tool's species and interaction lookups.",
    "credits.close": "Close",

    "drawer.title": "AI Assistant",
    "drawer.expand": "Expand AI assistant",
    "drawer.collapse": "Collapse AI assistant",
    "drawer.collapsedLabel": "AI",
    "drawer.expandedLabel": "AI Assistant",
    "drawer.statusThinking": "Thinking...",
    "drawer.statusError": "Error",
    "drawer.statusReady": "Ready",

    "chat.emptyIntro": "I'm your AI assistant.",
    "chat.emptyGuide": "You can ask me to:",
    "chat.emptyRead": "· Read current population counts",
    "chat.emptySet": "· Set a species' count",
    "chat.emptyControl": "· Start / pause / reset simulation",
    "chat.emptyBuild": "· Switch to Build Mode to create a new model (e.g., \"build a forest ecosystem\")",
    "chat.emptyTry": "Try: \"Read the current population, then set a species to 30\"",
    "chat.inputPlaceholder": "Type a message, Enter to send / Shift+Enter for newline",
    "chat.inputThinking": "AI is thinking...",
    "chat.send": "Send",

    "error.title": "😵 Something went wrong",
    "error.desc": "The app hit an unexpected error, possibly from chart rendering or AI message parsing.",
    "error.reload": "Reload",

    "model.switchTitle": "Switch ecosystem model",
    "model.singleTitle": "Only one model available (extension reserved)",
    "model.selectLabel": "Select ecosystem model",
    "app.githubRepo": "GitHub repository",
    "app.modelInfo": "Model info",
  },
} satisfies Record<Lang, Record<string, ReactNode>>;

/** 文案表 key 类型（zh/en 同构） */
export type MessageKey = keyof (typeof messages)["zh"];
