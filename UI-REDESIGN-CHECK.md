# UI 重构检查报告

本次改动按「从零重写」执行：旧 UI 设计全部弃用，仅保留业务逻辑层（hooks / i18n / tools / 引擎）。本报告记录设计决策、改动清单、规则合规自查、视觉检查过程与验证结果。

## 1. 设计方向：北方生态定位站（Boreal Field Station）

工具的使用场景是高中生物课堂里的生态学模拟（Lotka-Volterra）。界面定位为「野外定位站的记录仪面板」，理由：

- 教学工具需要长时间注视，冷调纸感底色（桦木色 `--birch`）比高饱和主题更护眼；
- 图表的物种曲线天然对应「记录仪通道」的隐喻——每个物种是一条通道，曲线是信号；
- 定位站意象自带科学记录的严肃感，与学生熟悉的地里/林里观察经验衔接。

### 设计 token（`src/styles.css`）

| Token | 值 | 用途 |
| --- | --- | --- |
| `--birch` | `#f1f4ef` | 页面底色，冷桦木纸 |
| `--snow` | `#fcfdfb` | 仪表面板暖白 |
| `--spruce` | `#1f3227` | 云杉墨，正文与标题 |
| `--moss` | `#64756a` | 苔灰绿，次级文字 |
| `--fog` | `#dde4db` | 雾绿发丝线 / 接缝 |
| `--pine` | `#2e6b51` | 松绿，主操作 / 激活态 |
| `--pine-deep` | `#245541` | 松绿 hover 加深 |
| `--pine-wash` | `#e7f0e9` | 松绿浅底，选中 / 悬浮衬底 |
| `--berry` | `#a8402a` | 花楸红，仅危险 / 错误 |
| `--berry-wash` | `#f7e9e4` | 花楸红浅底 |

字体：

- `--font-ui`：系统默认栈（system-ui / PingFang SC / Microsoft YaHei 等），无 Web 字体依赖；
- `--font-data`：系统等宽栈（ui-monospace / SF Mono / Menlo / Consolas），所有数字读数、时间轴、计数、物种计数用等宽，保证数字跳动时不抖版。

背景纹理：等高线由 `repeating-radial-gradient` 生成，纯 CSS 无图片资源。

### 签名元素：物种「通道带」

图表卡顶部是常驻文档流的通道带（`CustomLegend`）：每个物种 = 一条通道（方形色标端子 + 名称 + 等宽实时计数），按左轴 / 右轴分组，组标签颜色与对应轴线颜色一致。旧版浮层图例遮挡曲线的问题从结构上消除——通道带占用文档流，不与绘图区重叠。

### 主要交互决策

- 移除「Eco-Tuner」死按钮（长期禁用状态的控件对教学工具是噪声）。`EcoTunerModal` 组件与 `App.tsx` 中的 `tunerOpen` 状态保留，供后续扩展；
- AI 野账（AgentChatDrawer）收起时呈 52px 竖排轨道，与主工作台并排；展开时为完整野账面板；
- 清空对话保留原有的两段式确认（输入状态下再点一次确认）；
- 物种颜色（plant `#2e7d32`、hare `#1e88e5`、lynx `#e53935`）与 AI 添加物种的 `SPECIES_COLORS` 属数据层，本次未改动。

## 2. 改动文件清单

重写（UI 层）：

- `src/styles.css` — 全量重写（token / 布局 / 组件 / 响应式 / reduced-motion）
- `src/App.tsx` — 新页头（StationMark / GitHubIcon SVG、语言分段切换）、模式切换、工作台 grid + 轨道收起
- `src/components/ChartPanel.tsx` — 观察窗；删除 `onOpenTuner` prop
- `src/components/CustomLegend.tsx` — 通道带
- `src/components/DisturbPanel.tsx` — 干预面板
- `src/components/BuilderPanel.tsx` — 构建台（物种卡带 `--spine` 色条、关系类型芯片）
- `src/components/ai/AgentChatDrawer.tsx` — 野账抽屉（收起 / 展开双形态）
- `src/components/ai/MessageList.tsx` — 气泡、流式、工具小票
- `src/components/ai/MessageInput.tsx` — 编辑器、停止按钮
- `src/components/InfoModal.tsx` / `EcoTunerModal.tsx` / `ModelSelector.tsx` / `ErrorBoundary.tsx`

小幅修改（呈现层常量与入口）：

- `src/eco/useEcoChart.ts` — 仅画布呈现常量：`CANVAS_FONT`（mono）、`GRID_COLOR` / `GRID_BORDER` / `AXIS_TITLE_COLOR`、`maintainAspectRatio: false`、x 轴刻度 `autoSkip: true, maxTicksLimit: 12, maxRotation: 0`、tooltip 云杉墨底；逻辑未动
- `src/main.tsx` — 引入 @fontsource 字体
- `index.html` — `theme-color` → `#f1f4ef`

新增依赖：无。

验收后修复记录（第二轮验收反馈）：

- 生态扰动面板折叠失效：`.interrupt-body` 的显式 `display: flex` 覆盖了 `hidden` 属性的 UA 样式 `display: none`。修复为在基础重置区加全局兜底规则 `[hidden] { display: none !important; }`，使所有 `hidden` 属性恒定生效；
- 字体统一系统默认：移除 `@fontsource-variable/archivo` 与 `@fontsource/ibm-plex-mono`（package.json 依赖、main.tsx 导入、`font-stretch: 118%` 一并清除），`--font-ui` / `--font-data` / `CANVAS_FONT` 全部改为系统字体栈，构建产物不再包含字体文件。

第二轮验收反馈落实：

- 多物种显示评估（10 物种 harness 实测，桌面 1440px + 移动 390px 真实断点）：
  - 通道带 chip：正常换行、名称完整、关闭态正常，超长名称有省略号防御，无需改动；
  - 生态扰动滚动区：功能正常，但底部截断生硬无提示。修复为溢出时底部渐隐遮罩（`mask-image`，距底超 1px 渐隐、滚到底自动消失，ResizeObserver + scroll 监听驱动）；
- 生态扰动侧栏化（桌面端）：扰动面板从 deck 文档流提升为 workbench 左列，与野账抽屉同一套 rail 交互：
  - 桌面（>961px）模拟模式：三列布局（侧栏 264px | 观察窗 | 野账），侧栏收起为 52px 竖排轨道（竖字 + 物种色点列，整条可点展开），`grid-template-columns` 平滑过渡；
  - 移动端（≤960px）：保持文档流面板形态（现状不变）；
  - 构建模式：无扰动语义，侧栏不渲染，回两列布局；
  - 实现：新增 `src/hooks/useMediaQuery.ts`（JS 断点分支渲染，961px 与 CSS 960px 断点互补）；`DisturbPanel` 支持 rail / railOpen / onToggleRail 三态；ChartPanel 加 `showDisturb` 开关；i18n 新增 `disturb.shortTitle`；
  - 技术注记：轨道竖排用「限宽 1em + 逐字换行」实现（与野账轨道同机制）；`writing-mode: vertical-rl` 在系统字体缺 vertical metrics 时会叠字，已弃用。

第三轮验收反馈落实（观察窗撑满布局）：

- 问题：扰动面板侧栏化后，观察窗只剩图表卡内容高度，列底部大片空白；
- 修复：`.deck-chart` / `.chart-card` 桌面端撑满观察窗列高（flex:1），`.plot-frame` 从固定 `clamp(300px, 52vh, 500px)` 改为弹性 `flex:1 + min-height:320px`，绘图区随视口扩展、控制轨贴底；
- 通道带 chip 放大：色标 12→15px、图标 15→18px、名称 12.5→13.5px、计数 11.5→12.5px、内边距 4/5→7/12px、带区 padding 10/16→16/18px、chip 间距 6→8px；
- 移动端（≤960px）文档流恢复自然高度与固定限高（媒体查询内还原）；

第四轮验收反馈落实（信息弹窗精简）：

- 移除信息弹窗内的制作者声明区块与「鸣谢」入口按钮、整个鸣谢嵌套弹窗（`CreditsModal`）；
- 清理配套 i18n key（`info.authorsLabel` / `info.authorsName` / `info.credits` / `credits.*` 中英双语）与孤儿样式（`.info-authors` / `.author-*` / `.credits-*` / `.overlay.credits` / `.dialog.wide`）；
- InfoModal 随之简化：移除 showCredits 状态与嵌套弹窗分支，仅保留定位语与关闭按钮。

侧栏化后的布局补充（第三轮验收反馈）：

- 观察窗底部空白：扰动面板移出 deck 后图表卡只剩内容高度。修复为桌面端 `deck-chart` / `chart-card` 撑满列高（flex），`plot-frame` 由固定限高改为弹性扩展（`flex: 1` + `min-height: 320px` 保底），控制轨贴近视口底部；
- 通道带放大：chip 内边距 `4px 9px` → `7px 12px`、色标端子 12px → 15px、图标 15px → 18px、名称 12.5px → 13.5px、计数 11.5px → 12.5px，通道带容器 padding/gap 同步加大，物种 chip 获得更大显示空间；
- 移动端（≤960px）在响应式区块还原文档流自然高度与 `clamp(300px, 52vh, 500px)` 限高。

未改动：`src/i18n/*`、`src/eco/*`（除 useEcoChart 呈现常量）、`src/tools/*`、`server/*`、`src/components/modalBehavior.ts`。

## 3. Web Interface Guidelines 合规自查

依据 vercel-labs/web-interface-guidelines（已存档于技能目录 `guidelines.md`）逐项检查：

- 焦点：全局 `:focus-visible` 统一焦点环；仅有的 2 处 `outline: none`（编辑器、调参输入框）均配了替代焦点样式；
- 动效：过渡只声明具体属性，`prefers-reduced-motion: reduce` 下动画全关；
- 表单：文本编辑器 `autoComplete="off"` 且命名 `message`；`select` 显式声明底色与字色，避免系统外观穿透；
- 触控：按钮与开关的最小可点击尺寸达标；`app-shell` 处理了 `env(safe-area-inset-*)`；
- 文字：正文对比度基于 `--spruce` 于 `--snow` / `--birch` 之上，次级文字用 `--moss`；所有计数 / 读数使用等宽字体；
- 布局：图表容器 `maintainAspectRatio: false` + 限高，杜绝 Canvas 溢出；弹窗有遮罩、滚动锁定（复用既有 `modalBehavior`）；
- 语义：语言切换为分段控件并带 `aria-pressed`；删除按钮用 `aria-label` 标注物种名；模态均为原生 `dialog` 语义。

## 4. 视觉检查记录

工具：Playwright（全局安装，未写入 package.json），对 dev server 逐态截图。截图存于 `/tmp/opencode/shots/`（01–18，其中 15–18 为最终态）。

### 第一轮修复

- 问题：图表画布过高，把播放控制区挤出首屏。
- 修复：`maintainAspectRatio: false` + `.plot-frame` 限高 `clamp(300px, 52vh, 500px)`。
- 问题：时间轴刻度过密（i18n 标签较长时旋转堆叠）。
- 修复：x 轴刻度 `autoSkip: true, maxTicksLimit: 12, maxRotation: 0`。

### 第二轮修复（Guidelines 复查）

- 编辑器补 `autoComplete="off"` / `name="message"`；
- `app-shell` 补 `safe-area-inset-bottom`；
- `select` 显式声明底色字色；
- 全文反模式扫描：`outline: none` 仅 2 处且有焦点环替代，确认合规。

### 覆盖状态

桌面（中 / 英）初始态、运行态、通道关闭态、野账收起态、干预折叠态、构建模式空态、信息弹窗、移动端视口与全页；另用 harness 页面验证了填充态（构建物种卡、聊天气泡、工具小票、调参窗）。

## 5. 验证结果

- `npx tsc -p tsconfig.app.json --noEmit` 通过；
- `vitest run`：19 个文件 127 个用例全部通过；
- `npm run build` 通过（dist JS 约 623KB 的 chunk 体积提示为重构前既有情况，与本次无关）；
- 折叠修复经 Playwright 脚本验证：展开 → 点击折叠隐藏 → 再点展开，三态均正确；
- 系统字体经 computed style 验证：UI 与数据读数均已落到系统字体栈，dist/assets 无字体文件残留。

## 6. 遗留事项

- `tunerOpen` 状态与 `EcoTunerModal` 保留但当前不可达，作为后续扩展点；
- Playwright 为全局 dev 工具，未进入项目依赖；
- 本报告与代码改动在用户预览验收后再决定是否入库。
