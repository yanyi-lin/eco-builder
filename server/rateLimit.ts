// ========================= 全局每日请求计数器（内存版） =========================
// 由 worker/TokenCounter.ts（CF Durable Object + SQLite）迁移而来。
// 语义不变：每个 /api/chat 请求（含工具 auto-continuation 的每轮）+1，
// 每日 20k 上限；按日期（YYYY-MM-DD）计数，新的一天自然归零。
//
// 取舍（MIGRATION-PLAN §5）：目标场景为小规模多用户（个位数并发）单进程部署，
// 用进程内存计数即可；重启清零可接受（教学工具）。若未来多副本部署，
// 需换 Redis/共享存储——这是唯一需要改造的点。

export const DAILY_REQUEST_LIMIT = 20_000;

/** 内存计数表：date -> 当日请求数 */
const counts = new Map<string, number>();

function today(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * 指定日期请求次数 +1，返回 { count, allowed }。
 * allowed=false 表示已达当日上限，调用方应返回 429。
 */
export function incrementRequest(): { count: number; allowed: boolean } {
  const date = today();
  const next = (counts.get(date) ?? 0) + 1;
  counts.set(date, next);
  // 防内存无限增长：顺手清理 3 天前的过期日期（保持 Map 极小）
  for (const key of counts.keys()) {
    if (key < date) counts.delete(key);
  }
  return { count: next, allowed: next <= DAILY_REQUEST_LIMIT };
}

/** 查询当前累计值（诊断用，不递增） */
export function currentRequestCount(): number {
  return counts.get(today()) ?? 0;
}

/** 仅供测试：重置计数（避免测试间相互污染） */
export function __resetForTests(): void {
  counts.clear();
}
