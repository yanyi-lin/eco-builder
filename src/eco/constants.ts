// 通用常量
// 窗口须覆盖至少 2 个振荡周期，否则曲线看起来"无波动"：
// 自定义模型典型周期约 18 时间单位 ≈ 400 步，900 点 ≈ 40 时间单位 ≈ 2.2 个周期
export const MAX_DATA_POINTS = 900;
/** 模拟步进间隔（ms），与原 index.html setInterval(..., 38) 一致 */
export const SIM_INTERVAL_MS = 38;
/** 扰动可选百分比 */
export const DISTURB_PERCENTS = [0.1, 0.3, 0.5];
