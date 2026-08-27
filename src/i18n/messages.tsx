// ========================= 双语文案表（zh/en） =========================
// BILINGUAL-PLAN L0/L2。约束：
// - zh/en 的 key 严格对齐（satisfies Record<Lang, ...> 编译期保证）
// - 值为 ReactNode（可含 JSX：<br/>、链接），避免 HTML 字符串 XSS 面
// - 长文案多行用 JSX <br/> 或字符串换行（组件内 CSS 控制 white-space）
// - 文案规范（260827 交互审查）：按钮使用主动语态、描述具体动作；
//   省略号用「…」；按钮文案内不嵌 emoji（跨平台渲染不一致）；

import type { ReactNode } from "react";

export type Lang = "zh" | "en";

export const messages = {
  zh: {
    // === 语言切换 ===
    "lang.label": "语言",

    // === App 页头 ===
    "app.title.build": "生态模型构建器",
    "app.title.simulate": "生态模型构建器",
    "app.titlePage": "生态模型构建器 | 智能体助手",
    "app.switchToBuild": "构建新模型",
    "app.switchToSimulate": "返回模拟",
    "app.modeBuildBadge": "构建模式",
    "app.modeToggleAria": "切换模拟与构建模式，当前为",
    "app.modeSimulate": "模拟模式",
    "app.modeBuild": "构建模式",

    // === ChartPanel 控制 ===
    "chart.start": "开始模拟",
    "chart.pause": "暂停",
    "chart.resume": "继续",
    "chart.reset": "重置模拟",
    "chart.ecoTuner": "Eco-Tuner",
    "chart.ecoTunerTitle": "Eco-Tuner（已禁用）",
    "chart.axisTime": "模拟时间 (相对单位)",
    "chart.tooltipUnit": "个体/面积",
    "chart.canvasAria": "种群数量随时间变化折线图，包含物种：{species}",
    "chart.timeReadout": "模拟时间 {time}",
    "plot.label": "样方",

    // === DisturbPanel 扰动 ===
    "disturb.title": "生态扰动（减少种群数量）",
    "disturb.reduceAria": "将 {species} 的数量减少 {percent}%",
    "disturb.note":
      "点击后即时减少当前种群对应百分比（不低于最小阈值），系统自动调节展现恢复力与周期性",

    // === CustomLegend 图例 ===
    "legend.title": "图例",
    "legend.iconAlt": "图标",
    "legend.leftAxis": "左轴",
    "legend.rightAxis": "右轴",
    "legend.leftFallback": "左侧物种",
    "legend.otherFallback": "其他物种",
    "legend.note": "{left}位于左轴，{right}位于右轴。点击图例可隐藏/显示曲线，再次点击恢复。曲线最多保留最近 {n} 个采样点，更早的数据会滚动移出。",
    "legend.axisLeftShort": "左",
    "legend.axisRightShort": "右",

    // === BuilderPanel 构建面板 ===
    "builder.species": "物种",
    "builder.relations": "关系",
    "builder.params": "参数",
    "builder.emptySpecies": "还没有物种。在右侧聊天中告诉 AI 你想模拟什么。",
    "builder.emptyRelations": "还没有关系。让 AI 帮你定义物种间的关系。",
    "builder.tagDeathRate": "死亡率",
    "builder.remove": "移除",
    "builder.removeSpeciesAria": "移除物种 {species}",
    "builder.removeRelationAria": "移除关系 {relation}",
    "builder.relationPredation": "捕食",
    "builder.relationCompetition": "竞争",
    "builder.relationMutualism": "互利",

    // === EcoTunerModal ===
    "tuner.header": "Eco-Tuner - 模型参数自由调节",
    "tuner.groupDynamic": "模型动力学参数",
    "tuner.groupInitial": "初始种群数量",
    "tuner.resetParam": "重置",
    "tuner.resetAll": "重置所有参数为默认",
    "tuner.cancel": "取消",
    "tuner.apply": "应用并重置模拟",
    "tuner.closeAria": "关闭调参窗口",

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
        助手抽屉支持自然语言控制模拟与构建模型：
        <br />
        读取/设置种群、启停/重置，或构建森林等任意生态模型
      </>
    ),
    "info.authorsLabel": "制作者",
    "info.authorsName": "林炎逸",
    "info.close": "关闭",
    "info.credits": "鸣谢",
    "app.githubRepo": "GitHub 仓库",
    "app.modelInfo": "模型说明",
    "credits.title": "鸣谢",
    "credits.liuzimuName": "刘子木",
    "credits.liuzimuDesc": "提供 AI 助手交互的想法",
    "credits.opensourceTitle": "开源与数据支持",
    "credits.vercelAi": "Vercel AI SDK — AI 聊天与工具调用框架",
    "credits.react": "React — 前端 UI 框架",
    "credits.vite": "Vite — 构建工具",
    "credits.chartjs": "Chart.js — 生态曲线图表",
    "credits.hono": "Hono — 轻量 Node.js 后端框架",
    "credits.gbif": "GBIF — 物种分类数据",
    "credits.globi": "GloBI — 物种交互数据",
    "credits.note": "GBIF 与 GloBI 为开源生态数据平台，本工具的物种与交互查询依赖其数据。",
    "credits.close": "关闭",

    // === AgentChatDrawer ===
    "drawer.title": "智能体助手",
    "drawer.expand": "展开智能体助手",
    "drawer.collapse": "收起智能体助手",
    "drawer.collapsedLabel": "智能体",
    "drawer.expandedLabel": "收起",
    "drawer.statusThinking": "思考中…",
    "drawer.statusError": "出错",
    "drawer.statusReady": "就绪",
    "drawer.clear": "清空对话",
    "drawer.clearConfirm": "确认清空？",
    "drawer.clearAria": "清空对话历史",

    // === MessageList / MessageInput ===
    "chat.emptyIntro": "我是智能体助手。",
    "chat.emptyGuide": "可以用自然语言让我：",
    "chat.emptyRead": "读取当前种群数量",
    "chat.emptySet": "设置某物种数量",
    "chat.emptyControl": "启动 / 暂停 / 重置模拟",
    "chat.emptyBuild": "切换到构建模式搭建全新的生态模型",
    "chat.emptyTry": "试试说：",
    "chat.sample1": "读取当前种群数量",
    "chat.sample2": "把草的数量设为 30",
    "chat.sample3": "搭建一个草原生态系统",
    "chat.inputPlaceholder": "输入指令，Enter 发送，Shift+Enter 换行",
    "chat.inputThinking": "AI 正在思考…",
    "chat.inputAria": "输入给智能体助手的消息",
    "chat.send": "发送",
    "chat.stop": "停止",
    "chat.stopAria": "停止生成回复",
    "chat.fallback": "助手加载中…",
    "chat.errorTitle": "回复出错了，请检查网络后重试。",
    "chat.retry": "重试",
    "chat.toolDone": "完成",
    "chat.toolFailed": "失败",

    // === ErrorBoundary ===
    "error.title": "页面出错了",
    "error.desc": "应用遇到了一个未预期的错误，可能来自图表渲染或 AI 消息解析。",
    "error.reload": "重新加载",

    // === ModelSelector（历史遗留，隐藏保留） ===
    "model.switchTitle": "切换生态模型",
    "model.singleTitle": "当前仅一个模型，预留扩展",
    "model.selectLabel": "选择生态模型",
  },
  en: {
    "lang.label": "Language",

    "app.title.build": "Eco Model Builder",
    "app.title.simulate": "Eco Model Builder",
    "app.titlePage": "Eco Model Builder | AI Assistant",
    "app.switchToBuild": "Build New Model",
    "app.switchToSimulate": "Back to Simulation",
    "app.modeBuildBadge": "Build Mode",
    "app.modeToggleAria": "Toggle between simulation and build mode, currently",
    "app.modeSimulate": "Simulation",
    "app.modeBuild": "Build",

    "chart.start": "Start Simulation",
    "chart.pause": "Pause",
    "chart.resume": "Resume",
    "chart.reset": "Reset Simulation",
    "chart.ecoTuner": "Eco-Tuner",
    "chart.ecoTunerTitle": "Eco-Tuner (disabled)",
    "chart.axisTime": "Simulation time (relative units)",
    "chart.tooltipUnit": "individuals/area",
    "chart.canvasAria": "Line chart of population over time, species: {species}",
    "chart.timeReadout": "Simulation time {time}",
    "plot.label": "Quadrat",

    "disturb.title": "Ecological Disturbance (reduce population)",
    "disturb.reduceAria": "Reduce {species} population by {percent}%",
    "disturb.note":
      "Instantly reduces the population by the selected percentage (not below the minimum threshold); the system self-regulates to show resilience and periodicity",

    "legend.title": "Legend",
    "legend.iconAlt": "icon",
    "legend.leftAxis": "Left axis",
    "legend.rightAxis": "Right axis",
    "legend.leftFallback": "Left-side species",
    "legend.otherFallback": "Other species",
    "legend.note": "{left} on the left axis; {right} on the right axis. Click a legend item to hide/show curves; click again to restore. Curves keep at most the latest {n} samples; older data scrolls out.",
    "legend.axisLeftShort": "L",
    "legend.axisRightShort": "R",

    "builder.species": "Species",
    "builder.relations": "Relations",
    "builder.params": "Parameters",
    "builder.emptySpecies": "No species yet. Tell the AI in the chat what you want to simulate.",
    "builder.emptyRelations": "No relations yet. Ask the AI to define relationships between species.",
    "builder.tagDeathRate": "Death rate",
    "builder.remove": "Remove",
    "builder.removeSpeciesAria": "Remove species {species}",
    "builder.removeRelationAria": "Remove relation {relation}",
    "builder.relationPredation": "Predation",
    "builder.relationCompetition": "Competition",
    "builder.relationMutualism": "Mutualism",

    "tuner.header": "Eco-Tuner - Free parameter tuning",
    "tuner.groupDynamic": "Model dynamics",
    "tuner.groupInitial": "Initial populations",
    "tuner.resetParam": "Reset",
    "tuner.resetAll": "Reset all parameters to default",
    "tuner.cancel": "Cancel",
    "tuner.apply": "Apply & reset simulation",
    "tuner.closeAria": "Close tuner",

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
        The AI drawer lets you control simulation and build models in natural language:
        <br />
        read/set populations, start/pause/reset, or build any ecosystem model (e.g. a forest).
      </>
    ),
    "info.authorsLabel": "Author",
    "info.authorsName": "Yanyi Lin",
    "info.close": "Close",
    "info.credits": "Credits",
    "app.githubRepo": "GitHub repository",
    "app.modelInfo": "Model info",
    "credits.title": "Credits",
    "credits.liuzimuName": "Liu Zimu",
    "credits.liuzimuDesc": "Contributed the idea of AI assistant interaction",
    "credits.opensourceTitle": "Open source & data support",
    "credits.vercelAi": "Vercel AI SDK — AI chat & tool-calling framework",
    "credits.react": "React — frontend UI framework",
    "credits.vite": "Vite — build tool",
    "credits.chartjs": "Chart.js — ecology curves charting",
    "credits.hono": "Hono — lightweight Node.js backend framework",
    "credits.gbif": "GBIF — species taxonomy data",
    "credits.globi": "GloBI — species interaction data",
    "credits.note":
      "GBIF and GloBI are open ecology data platforms that power this tool's species and interaction lookups.",
    "credits.close": "Close",

    "drawer.title": "AI Assistant",
    "drawer.expand": "Expand AI assistant",
    "drawer.collapse": "Collapse AI assistant",
    "drawer.collapsedLabel": "AI",
    "drawer.expandedLabel": "Collapse",
    "drawer.statusThinking": "Thinking…",
    "drawer.statusError": "Error",
    "drawer.statusReady": "Ready",
    "drawer.clear": "Clear chat",
    "drawer.clearConfirm": "Confirm clear?",
    "drawer.clearAria": "Clear chat history",

    "chat.emptyIntro": "I'm your AI assistant.",
    "chat.emptyGuide": "You can ask me to:",
    "chat.emptyRead": "Read current population counts",
    "chat.emptySet": "Set a species' count",
    "chat.emptyControl": "Start / pause / reset simulation",
    "chat.emptyBuild": "Switch to Build Mode to create a new model",
    "chat.emptyTry": "Try:",
    "chat.sample1": "Read the current populations",
    "chat.sample2": "Set the plant population to 30",
    "chat.sample3": "Build a grassland ecosystem",
    "chat.inputPlaceholder": "Type a message. Enter to send, Shift+Enter for newline",
    "chat.inputThinking": "AI is thinking…",
    "chat.inputAria": "Message to the AI assistant",
    "chat.send": "Send",
    "chat.stop": "Stop",
    "chat.stopAria": "Stop generating",
    "chat.fallback": "Assistant loading…",
    "chat.errorTitle": "Something went wrong. Check your connection and retry.",
    "chat.retry": "Retry",
    "chat.toolDone": "done",
    "chat.toolFailed": "failed",

    "error.title": "Something went wrong",
    "error.desc": "The app hit an unexpected error, possibly from chart rendering or AI message parsing.",
    "error.reload": "Reload",

    "model.switchTitle": "Switch ecosystem model",
    "model.singleTitle": "Only one model available (extension reserved)",
    "model.selectLabel": "Select ecosystem model",
  },
} satisfies Record<Lang, Record<string, ReactNode>>;

/** 文案表 key 类型（zh/en 同构） */
export type MessageKey = keyof (typeof messages)["zh"];
