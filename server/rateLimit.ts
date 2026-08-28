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

/** 测试钩子：可注入"当前时间"以测试跨日重置（生产环境保持 null） */
let nowOverride: (() => Date) | null = null;
export function __setNowForTests(fn: (() => Date) | null): void {
  nowOverride = fn;
}

function today(): string {
  const d = nowOverride ? nowOverride() : new Date();
  return d.toISOString().split("T")[0];
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

// ========================= per-IP 滑动窗口限流 + 并发上限（内存版） =========================
// 第二/三层防线：全局每日 20k 是账单兜底，per-IP 限制防单点滥用（脚本刷量、并行流烧钱）。
// 与每日计数器同为进程内存实现——单进程（宝塔 Node）下精确；CF 多 isolate 下 per-isolate
// 近似，与每日计数器语义一致。零 CF/Redis 依赖（部署架构约束：业务层不强绑 CF）。

/** 滑动窗口长度：1 小时 */
export const IP_WINDOW_MS = 60 * 60 * 1000;

/**
 * 单 IP 窗口内最大请求数。数字依据：
 * - 工具 auto-continuation 每轮都是独立 POST（一次完整构建会话 ≈ 10-15 轮）；
 * - 校园机房 NAT 多学生共享出口 IP，需留多会话余量；
 * 60 次/小时 ≈ 4-5 次完整构建，滥用者上限 60 × 4096 输出 token 仍可控。
 */
export const IP_WINDOW_LIMIT = 60;
/**
 * 单 IP 最大并发流式请求。NAT 后多用户可能同时各开 1 个流，
 * 4 允许机房正常并发、仍封死单 IP 脚本并行刷流（每流输出 ≤ MAX_OUTPUT_TOKENS）。
 */
export const IP_CONCURRENCY_LIMIT = 4;
const ipHits = new Map<string, number[]>();
/** 该 IP 当前进行中的请求数 */
const ipInFlight = new Map<string, number>();

/** 防内存增长：跟踪 IP 数超过该值时，清扫窗口内已无记录的 IP（正常流量远达不到） */
const MAX_TRACKED_IPS = 10_000;

function sweepStaleIps(now: number): void {
  if (ipHits.size < MAX_TRACKED_IPS) return;
  for (const [ip, hits] of ipHits) {
    // 窗口外全部过期 → 删除记录
    const live = hits.filter((t) => now - t < IP_WINDOW_MS);
    if (live.length === 0) ipHits.delete(ip);
    else ipHits.set(ip, live);
  }
}

/**
 * per-IP 滑动窗口检查（不计数，先查后记由调用方拆开以便并发检查同批完成）。
 * allowed=false 时 retryAfterSec 为窗口腾出空位所需秒数（HTTP Retry-After 用）。
 */
export function checkIpWindow(
  ip: string,
): { allowed: true } | { allowed: false; retryAfterSec: number } {
  const now = nowOverride ? nowOverride().getTime() : Date.now();
  sweepStaleIps(now);
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS);
  if (hits.length >= IP_WINDOW_LIMIT) {
    const oldest = Math.min(...hits);
    const retryAfterSec = Math.max(1, Math.ceil((oldest + IP_WINDOW_MS - now) / 1000));
    return { allowed: false, retryAfterSec };
  }
  return { allowed: true };
}

/** 记录一次请求（窗口检查通过后调用） */
export function recordIpHit(ip: string): void {
  const now = nowOverride ? nowOverride().getTime() : Date.now();
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS);
  hits.push(now);
  ipHits.set(ip, hits);
}

/**
 * 尝试占用一个并发槽位。超过 IP_CONCURRENCY_LIMIT 返回 false（调用方应 429）。
 * 槽位必须用 releaseIpSlot 释放，否则该 IP 永久打满（自查：释放处恒为 finally）。
 */
export function acquireIpSlot(ip: string): boolean {
  const cur = ipInFlight.get(ip) ?? 0;
  if (cur >= IP_CONCURRENCY_LIMIT) return false;
  ipInFlight.set(ip, cur + 1);
  return true;
}

/** 释放并发槽位（计数归零即删 key，防 Map 无限增长） */
export function releaseIpSlot(ip: string): void {
  const cur = ipInFlight.get(ip) ?? 0;
  if (cur <= 1) ipInFlight.delete(ip);
  else ipInFlight.set(ip, cur - 1);
}

/** 仅供测试：重置 per-IP 限流状态 */
export function __resetIpLimiterForTests(): void {
  ipHits.clear();
  ipInFlight.clear();
}
