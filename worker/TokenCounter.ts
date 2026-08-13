// ========================= 全局请求计数器（每日） =========================
// 目标：全局限额（跨所有 EcoChatAgent 会话实例）。DO 实例的 SQLite 是
// 实例私有的，无法直接共享，故用**固定 name 的计数器 DO** 聚合——
// 所有会话实例通过 env.ECO_COUNTER.get(idFromName("global")) 的 RPC
// increment() 原子计数（DO 单线程保证原子性，无并发丢计数）。
//
// 语义：每个 onChatMessage（含工具 auto-continuation 的每轮）请求 +1，
// 每日 20k 上限。按 date 主键，新的一天自然新行（无需定时清理）。
//
// 继承 cloudflare:workers 的 DurableObject 基类以获得 DurableObjectBranded
// 标记：这样 env.ECO_COUNTER.get() 返回类型化 stub，RPC 调用类型安全。
import { DurableObject } from "cloudflare:workers";

export interface CounterResult {
  /** 该日期累计请求次数（含本次 +1） */
  count: number;
}

export class TokenCounter extends DurableObject {
  /** 幂等建表 */
  private async ensureTable() {
    await this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS daily_request_count (
        date TEXT PRIMARY KEY,
        count INTEGER DEFAULT 0
      )
    `);
  }

  /** 指定日期请求次数 +1，返回最新累计值 */
  async increment(date: string): Promise<CounterResult> {
    await this.ensureTable();
    const rows = await this.ctx.storage.sql.exec(
      `SELECT count FROM daily_request_count WHERE date = ?`,
      [date],
    );
    const current = rows.toArray()[0]?.count as number | undefined;
    const next = (current ?? 0) + 1;
    await this.ctx.storage.sql.exec(
      `INSERT INTO daily_request_count (date, count) VALUES (?, ?)
       ON CONFLICT(date) DO UPDATE SET count = excluded.count`,
      [date, next],
    );
    return { count: next };
  }

  /** 查询指定日期累计值（不递增，诊断用） */
  async get(date: string): Promise<number> {
    await this.ensureTable();
    const rows = await this.ctx.storage.sql.exec(
      `SELECT count FROM daily_request_count WHERE date = ?`,
      [date],
    );
    return (rows.toArray()[0]?.count as number | undefined) ?? 0;
  }
}
