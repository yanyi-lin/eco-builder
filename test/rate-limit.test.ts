import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  incrementRequest,
  currentRequestCount,
  __resetForTests,
  __setNowForTests,
  DAILY_REQUEST_LIMIT,
  checkIpWindow,
  recordIpHit,
  acquireIpSlot,
  releaseIpSlot,
  __resetIpLimiterForTests,
  IP_WINDOW_LIMIT,
  IP_CONCURRENCY_LIMIT,
  IP_WINDOW_MS,
} from "../server/rateLimit";

// 由 test/token-counter.test.ts（CF DO SQLite 版）迁移而来：
// 内存版限流保留等价语义——首次从 1 计数、同日期累加、跨日独立、超限拒绝。
describe("rateLimit（全局每日请求计数，内存版）", () => {
  beforeEach(() => __resetForTests());
  afterEach(() => __setNowForTests(null));

  it("首次 increment 从 1 开始", () => {
    const { count, allowed } = incrementRequest();
    expect(count).toBe(1);
    expect(allowed).toBe(true);
  });

  it("连续 increment 累加", () => {
    incrementRequest();
    incrementRequest();
    const { count } = incrementRequest();
    expect(count).toBe(3);
  });

  it("不同日期独立计数（每日重置语义）", () => {
    __setNowForTests(() => new Date("2026-08-13T10:00:00Z"));
    incrementRequest();
    expect(currentRequestCount()).toBe(1);

    __setNowForTests(() => new Date("2026-08-14T10:00:00Z"));
    expect(currentRequestCount()).toBe(0);
    const { count } = incrementRequest();
    expect(count).toBe(1);
  });

  it("达到每日上限后 allowed=false", () => {
    // 消耗全部额度（20000 次 Map 操作，毫秒级）
    for (let i = 0; i < DAILY_REQUEST_LIMIT; i++) incrementRequest();
    const { count, allowed } = incrementRequest();
    expect(count).toBe(DAILY_REQUEST_LIMIT + 1);
    expect(allowed).toBe(false);
  });

  it("跨日后限制恢复（新的一天从 1 开始）", () => {
    __setNowForTests(() => new Date("2026-08-13T10:00:00Z"));
    for (let i = 0; i < DAILY_REQUEST_LIMIT; i++) incrementRequest();
    expect(incrementRequest().allowed).toBe(false);

    __setNowForTests(() => new Date("2026-08-14T10:00:00Z"));
    expect(incrementRequest().allowed).toBe(true);
  });
});

// ========================= per-IP 滑动窗口 + 并发槽位 =========================
describe("rateLimit（per-IP 窗口与并发，内存版）", () => {
  beforeEach(() => {
    __resetForTests();
    __resetIpLimiterForTests();
  });
  afterEach(() => __setNowForTests(null));

  it("窗口内未超限：checkIpWindow 允许，recordIpHit 计数生效", () => {
    for (let i = 0; i < IP_WINDOW_LIMIT; i++) {
      expect(checkIpWindow("1.2.3.4").allowed).toBe(true);
      recordIpHit("1.2.3.4");
    }
    // 已达上限：第 21 次被拒
    const denied = checkIpWindow("1.2.3.4");
    expect(denied).toMatchObject({ allowed: false });
    if (!denied.allowed) expect(denied.retryAfterSec).toBeGreaterThan(0);
  });

  it("滑动窗口：时间推进超出 1 小时后额度恢复", () => {
    __setNowForTests(() => new Date("2026-08-28T10:00:00Z"));
    for (let i = 0; i < IP_WINDOW_LIMIT; i++) recordIpHit("1.2.3.4");
    expect(checkIpWindow("1.2.3.4").allowed).toBe(false);

    // 推进到窗口外（最早一次记录 + 窗口长度）
    __setNowForTests(() => new Date("2026-08-28T10:00:00Z"));
    const advanced = new Date(Date.now() + IP_WINDOW_MS + 1000);
    __setNowForTests(() => advanced);
    expect(checkIpWindow("1.2.3.4").allowed).toBe(true);
  });

  it("不同 IP 窗口互不影响", () => {
    for (let i = 0; i < IP_WINDOW_LIMIT; i++) recordIpHit("1.2.3.4");
    expect(checkIpWindow("5.6.7.8").allowed).toBe(true);
    expect(checkIpWindow("1.2.3.4").allowed).toBe(false);
  });

  it("并发槽位：占满后拒绝，释放后可再占用", () => {
    // 占满全部槽位（IP_CONCURRENCY_LIMIT 当前为 4）
    for (let i = 0; i < IP_CONCURRENCY_LIMIT; i++) {
      expect(acquireIpSlot("1.2.3.4")).toBe(true);
    }
    expect(acquireIpSlot("1.2.3.4")).toBe(false);
    releaseIpSlot("1.2.3.4");
    expect(acquireIpSlot("1.2.3.4")).toBe(true);
  });

  it("并发槽位：多释放不产生负数（防御性，释放恒配对 try/finally）", () => {
    acquireIpSlot("1.2.3.4");
    releaseIpSlot("1.2.3.4");
    releaseIpSlot("1.2.3.4"); // 多余释放不应崩溃
    expect(acquireIpSlot("1.2.3.4")).toBe(true);
  });

  it("不同 IP 并发槽位独立", () => {
    for (let i = 0; i < IP_CONCURRENCY_LIMIT; i++) acquireIpSlot("1.2.3.4");
    expect(acquireIpSlot("1.2.3.4")).toBe(false);
    expect(acquireIpSlot("5.6.7.8")).toBe(true);
  });
});
