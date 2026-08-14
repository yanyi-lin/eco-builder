import { describe, it, expect, vi, beforeEach } from "vitest";

// mock cloudflare:workers 的 DurableObject 基类，使 TokenCounter 可在 node 环境实例化
const mockedStorage = vi.hoisted(() => {
  const rows: { date: string; count: number }[] = [];
  return {
    rows,
    sql: {
      exec: vi.fn((query: string, ...bindings: unknown[]) => {
        // 复刻 TokenCounter 的 SQL 逻辑（SELECT / INSERT / UPDATE）
        const q = query.trim();
        if (q.startsWith("CREATE TABLE")) {
          return { toArray: () => [] as unknown[] };
        }
        if (q.startsWith("SELECT")) {
          const date = bindings[0] as string;
          return {
            toArray: () =>
              rows
                .filter((r) => r.date === date)
                .map((r) => ({ count: r.count })),
          };
        }
        if (q.startsWith("INSERT")) {
          rows.push({ date: bindings[0] as string, count: bindings[1] as number });
          return { toArray: () => [] as unknown[] };
        }
        if (q.startsWith("UPDATE")) {
          const target = rows.find((r) => r.date === (bindings[1] as string));
          if (target) target.count = bindings[0] as number;
          return { toArray: () => [] as unknown[] };
        }
        throw new Error(`Unhandled SQL: ${q}`);
      }),
    },
  };
});

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    protected ctx: unknown;
    protected env: unknown;
    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));

import { TokenCounter } from "../worker/TokenCounter";

describe("TokenCounter（全局请求计数）", () => {
  let counter: TokenCounter;

  beforeEach(() => {
    mockedStorage.rows.length = 0;
    const ctx = { storage: { sql: mockedStorage.sql } };
    counter = new TokenCounter(ctx as any, {} as any);
  });

  it("首次 increment 从 1 开始（INSERT 路径）", async () => {
    const { count } = await counter.increment("2026-08-13");
    expect(count).toBe(1);
  });

  it("连续 increment 累加（UPDATE 路径）", async () => {
    await counter.increment("2026-08-13");
    await counter.increment("2026-08-13");
    const { count } = await counter.increment("2026-08-13");
    expect(count).toBe(3);
  });

  it("不同日期独立计数（每日重置语义）", async () => {
    await counter.increment("2026-08-13");
    const { count } = await counter.increment("2026-08-14");
    expect(count).toBe(1);
  });

  it("get 返回指定日期累计值（不递增）", async () => {
    await counter.increment("2026-08-13");
    await counter.increment("2026-08-13");
    expect(await counter.get("2026-08-13")).toBe(2);
    expect(await counter.get("2026-08-14")).toBe(0);
  });
});
