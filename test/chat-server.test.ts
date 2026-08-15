import { describe, it, expect, vi, beforeAll, afterAll, afterEach, beforeEach } from "vitest";
import { createApp } from "../server/index";
import { handleChatRequest } from "../server/chat";
import { __resetForTests, __setNowForTests, DAILY_REQUEST_LIMIT } from "../server/rateLimit";
import type { Express } from "express";
import type { Server } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ============================================================
// chat 协议层测试（handleChatRequest + mock LLM fetch）
// 不真调 OpenAI：vi.stubGlobal("fetch") 拦截 @ai-sdk/openai-compatible 请求
// ============================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "../dist");

/** 构造 OpenAI Chat Completions SSE 流响应，返回捕获请求体的函数 */
function mockLLM(openAIChunks: unknown[]): () => unknown {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const c of openAIChunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(c)}\n\n`));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  let captured: unknown;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string | URL, init?: RequestInit) => {
      captured = JSON.parse(String(init?.body));
      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }),
  );
  return () => captured;
}

function textChunks(text: string): unknown[] {
  return [
    {
      id: "1", object: "chat.completion.chunk", created: 0, model: "mock",
      choices: [{ index: 0, delta: { role: "assistant", content: text }, finish_reason: null }],
    },
    { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
  ];
}

function toolChunks(toolName: string): unknown[] {
  return [
    {
      id: "1", object: "chat.completion.chunk", created: 0, model: "mock",
      choices: [{
        index: 0,
        delta: {
          role: "assistant",
          tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: toolName, arguments: "{}" } }],
        },
        finish_reason: null,
      }],
    },
    { choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] },
  ];
}

/** 解析 UIMessageStream 响应（data: JSON 行，去掉 [DONE]） */
async function collectUIStream(response: Response): Promise<Record<string, unknown>[]> {
  const text = await response.text();
  return text
    .split("\n")
    .filter((l) => l.startsWith("data: ") && !l.includes("[DONE]"))
    .map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);
}

function userMsg(text: string) {
  return { id: "m1", role: "user" as const, parts: [{ type: "text" as const, text }] };
}

beforeAll(() => {
  process.env.OPENAI_BASE_URL = "http://mock.local";
  process.env.OPENAI_API_KEY = "mock-key";
  process.env.OPENAI_MODEL = "mock-model";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("handleChatRequest 协议", () => {
  it("纯文本回复：输出 text-delta 流并以 stop 结束", async () => {
    mockLLM(textChunks("你好，这是测试回复。"));
    const res = await handleChatRequest([userMsg("你好")]);
    expect(res.status).toBe(200);
    const events = await collectUIStream(res);
    expect(events[0]).toMatchObject({ type: "start" });
    expect(events.some((e) => e.type === "text-delta" && (e.delta as string).includes("测试回复"))).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "finish", finishReason: "stop" });
  });

  it("工具调用：输出 tool-input 流并以 tool-calls 结束", async () => {
    mockLLM(toolChunks("read-animal-data"));
    const res = await handleChatRequest([userMsg("读取当前种群")]);
    const events = await collectUIStream(res);
    expect(events.some((e) => e.type === "tool-input-start" && e.toolName === "read-animal-data")).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "finish", finishReason: "tool-calls" });
  });

  it("带工具结果输入：convertToModelMessages 转成 tool 消息发给 LLM", async () => {
    const getBody = mockLLM(textChunks("好的"));
    const res = await handleChatRequest([
      userMsg("读取当前种群"),
      {
        id: "m2",
        role: "assistant" as const,
        parts: [{
          type: "tool-invocation" as const,
          toolCallId: "call_1",
          toolName: "read-animal-data",
          state: "output-available" as const,
          args: {},
          input: {},
          output: { species: [{ id: "plant", name: "植物", count: 100 }] },
        }],
      },
    ]);
    // 消费流以触发 LLM fetch（toUIMessageStreamResponse 是 lazy 流）
    await collectUIStream(res);
    const body = getBody() as { messages: unknown[] };
    const last = body.messages[body.messages.length - 1] as { role: string };
    expect(last.role).toBe("tool");
  });

  it("残缺工具 part（input-available 无输出）被忽略，不触发 MissingToolResultsError", async () => {
    const getBody = mockLLM(textChunks("好的"));
    const res = await handleChatRequest([
      userMsg("读取当前种群"),
      {
        id: "m2",
        role: "assistant" as const,
        parts: [{
          type: "tool-invocation" as const,
          toolCallId: "call_x",
          toolName: "read-animal-data",
          state: "input-available" as const,
          args: {},
          input: {},
        }],
      },
    ]);
    const events = await collectUIStream(res);
    expect(events.some((e) => e.type === "error")).toBe(false);
    // LLM 请求里不应包含该 tool 调用（被 ignoreIncompleteToolCalls 过滤）
    const body = getBody() as { messages: { role: string }[] };
    expect(body.messages.some((m) => m.role === "tool")).toBe(false);
  });

  it("构建模式：[MODE: build] 前缀被剥离，且使用构建模式系统提示", async () => {
    const getBody = mockLLM(textChunks("好的"));
    const res = await handleChatRequest([userMsg("[MODE: build] 构建森林生态系统")]);
    // 消费流以触发 LLM fetch（toUIMessageStreamResponse 是 lazy 流）
    await collectUIStream(res);
    const body = getBody() as { messages: { role: string; content?: string }[] };
    const system = body.messages[0];
    expect(system.role).toBe("system");
    expect(String(system.content)).toContain("构建模式");
    // 用户消息中前缀已被剥离
    const user = body.messages.find((m) => m.role === "user");
    expect(String(user?.content)).not.toContain("[MODE: build]");
  });

  it("模拟模式使用模拟模式系统提示", async () => {
    const getBody = mockLLM(textChunks("好的"));
    const res = await handleChatRequest([userMsg("读取当前种群")]);
    // 消费流以触发 LLM fetch（toUIMessageStreamResponse 是 lazy 流）
    await collectUIStream(res);
    const body = getBody() as { messages: { role: string; content?: string }[] };
    expect(String(body.messages[0].content)).toContain("模拟模式");
  });
});

// ============================================================
// app 层测试（createApp + 真实 HTTP，不 stub fetch）
// ============================================================

describe("createApp HTTP 层", () => {
  let app: Express;
  let server: Server;
  let base: string;

  beforeAll(async () => {
    // 确保 dist/index.html 存在（CI 中 test 先于 build 执行；占位文件仅验证静态服务行为）
    fs.mkdirSync(DIST_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(DIST_DIR, "index.html"),
      "<!DOCTYPE html><html><body>eco-builder-test</body></html>",
    );

    app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const addr = server.address();
    base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  });

  afterAll(() => {
    server?.close();
  });

  it("GET /api/health 返回 ok", async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("GET / 返回 index.html 且带安全头、无 x-powered-by", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("eco-builder-test");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-powered-by")).toBeNull();
  });

  it("未知路径走 SPA fallback 返回 index.html", async () => {
    const res = await fetch(`${base}/some/client/route`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("eco-builder-test");
  });

  it("POST /api/chat 无 messages 返回 400", async () => {
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("超过每日上限返回 429（限流在调用 LLM 前拦截）", async () => {
    __resetForTests();
    __setNowForTests(() => new Date("2026-08-15T10:00:00Z"));
    for (let i = 0; i < DAILY_REQUEST_LIMIT; i++) {
      // 直接消耗配额（绕过 HTTP，避免 2 万次真实请求）
      const { incrementRequest } = await import("../server/rateLimit");
      incrementRequest();
    }
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [userMsg("hi")] }),
    });
    expect(res.status).toBe(429);
    __setNowForTests(null);
  });
});

describe("环境变量校验", () => {
  beforeEach(() => {
    __resetForTests();
  });

  it("缺少 OPENAI_API_KEY 时 createApp 抛错（fail-fast）", () => {
    const saved = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    expect(() => createApp()).toThrow(/OPENAI_API_KEY/);
    process.env.OPENAI_API_KEY = saved;
  });
});
