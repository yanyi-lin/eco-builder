import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  incrementRequest,
  currentRequestCount,
  __resetForTests,
  __setNowForTests,
  DAILY_REQUEST_LIMIT,
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
