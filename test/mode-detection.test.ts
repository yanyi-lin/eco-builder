import { describe, it, expect } from "vitest";
// 迁移后 mode.ts 从 worker/ 移至 server/（脱离 CF，逻辑原样保留）
import { detectBuildMode, stripModePrefix, MODE_BUILD_PREFIX } from "../server/mode";

// 构造最小 UIMessage（仅包含测试需要的字段）
function userMsg(id: string, text: string) {
  return {
    id,
    role: "user" as const,
    parts: [{ type: "text" as const, text }],
  };
}
function assistantToolMsg(id: string) {
  return {
    id,
    role: "assistant" as const,
    parts: [{ type: "tool-invocation" as const }],
  };
}

describe("detectBuildMode", () => {
  it("最后一条 user 消息带 [MODE: build] → 构建模式", () => {
    const messages = [userMsg("1", "构建鲸落"), userMsg("2", `${MODE_BUILD_PREFIX} 构建森林`)];
    expect(detectBuildMode(messages)).toBe(true);
  });

  it("最后一条 user 消息无前缀 → 模拟模式", () => {
    const messages = [userMsg("1", `${MODE_BUILD_PREFIX} 构建森林`), userMsg("2", "读取种群")];
    expect(detectBuildMode(messages)).toBe(false);
  });

  it("空历史 → 模拟模式", () => {
    expect(detectBuildMode([])).toBe(false);
  });

  it("最后一条是 assistant 工具消息时，仍从更早的 user 消息判定（issue #10 回归）", () => {
    // 工具 auto-continuation：最后一条是 assistant 工具消息，倒数第二条 user 带前缀
    const messages = [userMsg("1", `${MODE_BUILD_PREFIX} 构建森林`), assistantToolMsg("2")];
    expect(detectBuildMode(messages)).toBe(true);
  });

  it("最后一条是 assistant 工具消息且其前 user 无前缀 → 模拟模式", () => {
    const messages = [userMsg("1", "读取种群"), assistantToolMsg("2")];
    expect(detectBuildMode(messages)).toBe(false);
  });

  it("多轮中较老的 user 带前缀但最新 user 无前缀 → 模拟模式（只看最新）", () => {
    const messages = [
      userMsg("1", `${MODE_BUILD_PREFIX} 构建森林`),
      userMsg("2", "继续"),
    ];
    expect(detectBuildMode(messages)).toBe(false);
  });
});

describe("stripModePrefix", () => {
  it("剥离文本开头的 [MODE: build] 前缀", () => {
    const messages = [userMsg("1", `${MODE_BUILD_PREFIX} 构建森林`)];
    const cleaned = stripModePrefix(messages);
    expect(cleaned[0].parts[0].type).toBe("text");
    expect((cleaned[0].parts[0] as { text: string }).text).toBe("构建森林");
  });

  it("不影响无前缀消息", () => {
    const messages = [userMsg("1", "读取种群")];
    const cleaned = stripModePrefix(messages);
    expect((cleaned[0].parts[0] as { text: string }).text).toBe("读取种群");
  });

  it("不影响 assistant 工具消息（无文本部分）", () => {
    const messages = [assistantToolMsg("2")];
    const cleaned = stripModePrefix(messages);
    expect(cleaned[0].parts).toHaveLength(1);
  });
});
