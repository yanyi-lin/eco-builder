// @vitest-environment jsdom
// 前端续发链路回归测试（2026-08-15 两次修复验证）：
// 1. onToolCall 内不 await addToolOutput（避免 SerialJobExecutor 死锁）
// 2. sendAutomaticallyWhen 只检查"最后一部分"（修复"工具结果轮次后无限续发"：
//    ai 6.0.230 续发时 replace + parts 累积，历史 output-available tool part
//    永不消失，检查"任意 part"会恒 true → 无限循环）
// 渲染真实 useEcoAgent（useChat），mock 服务端 SSE 流，验证工具调用后能正常收尾。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor, act, cleanup } from "@testing-library/react";
import { useMemo, useState } from "react";
import { useEcoAgent } from "../src/components/ai/useEcoAgent";

// mock 工具执行器（避免真实 GBIF/构建逻辑/网络）
vi.mock("../src/tools/ecoTools", () => ({
  executeTool: vi.fn(async (name: string) => ({ ok: true, tool: name })),
}));
vi.mock("../src/tools/builderTools", () => ({
  executeBuilderTool: vi.fn(async (name: string) => ({ ok: true, tool: name })),
}));

// ---- mock 服务端 SSE（等价 server 端 toUIMessageStreamResponse 输出）----
function sse(obj: Record<string, unknown>): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}
function textStream(text: string): string {
  return [
    sse({ type: "start" }),
    sse({ type: "start-step" }),
    sse({ type: "text-start", id: "t1" }),
    sse({ type: "text-delta", id: "t1", delta: text }),
    sse({ type: "text-end", id: "t1" }),
    sse({ type: "finish-step" }),
    sse({ type: "finish", finishReason: "stop" }),
    "data: [DONE]\n\n",
  ].join("");
}
function toolStream(toolName: string, toolCallId: string): string {
  return [
    sse({ type: "start" }),
    sse({ type: "start-step" }),
    sse({ type: "tool-input-start", toolCallId, toolName }),
    sse({ type: "tool-input-delta", toolCallId, inputTextDelta: "{}" }),
    sse({ type: "tool-input-available", toolCallId, toolName, input: {} }),
    sse({ type: "finish-step" }),
    sse({ type: "finish", finishReason: "tool-calls" }),
    "data: [DONE]\n\n",
  ].join("");
}

function Harness() {
  const [, setN] = useState(0);
  const sim = useMemo(
    () => ({
      spec: { id: "test", name: "测试", species: [], relations: [] },
      populations: {},
      currentTime: 0,
      simulationRunning: false,
      simulationActive: false,
      setPopulation: vi.fn(),
      startSimulation: vi.fn(),
      pauseSimulation: vi.fn(),
      fullReset: vi.fn(),
    }),
    [],
  );
  const builder = useMemo(
    () => ({
      state: { species: [], relations: [] },
      api: { setSpecies: vi.fn(), setParams: vi.fn() },
      addSpecies: vi.fn(),
      removeSpecies: vi.fn(),
      addRelation: vi.fn(),
      removeRelation: vi.fn(),
      buildAndRun: vi.fn(),
    }),
    [],
  );
  const agent = useEcoAgent(sim as never, builder as never, "build");
  void setN;
  return (
    <div>
      <button onClick={() => agent.sendMessage("构建森林生态系统")}>send</button>
      <span data-testid="status">{agent.status}</span>
    </div>
  );
}

/** 等链路的 status 离开 submitted/streaming（空闲） */
async function waitIdle(getStatus: () => string | null, timeoutMs = 10000): Promise<void> {
  await waitFor(
    () => {
      const s = getStatus();
      expect(s).not.toBe("submitted");
      expect(s).not.toBe("streaming");
    },
    { timeout: timeoutMs },
  );
}

describe("useEcoAgent 续发链路（构建模式）", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it("工具调用 → 纯文本收尾后停止（不无限续发）", async () => {
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: unknown[] };
      const last = body.messages[body.messages.length - 1] as
        | { role?: string; parts?: { state?: string }[] }
        | undefined;
      const hasToolResult =
        last?.role === "assistant" &&
        (last.parts ?? []).some((p) => p.state === "output-available");
      const stream = hasToolResult
        ? textStream("好的，模型已构建完成")
        : toolStream("add-species", "call_1");
      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getByText, getByTestId } = render(<Harness />);
    act(() => {
      fireEvent.click(getByText("send"));
    });

    await waitIdle(() => getByTestId("status").textContent);
    // 空闲后再等 1.5s，确认没有继续发请求（防无限循环）
    const callsAfterSettle = fetchMock.mock.calls.length;
    await new Promise((r) => setTimeout(r, 1500));
    expect(fetchMock.mock.calls.length).toBe(callsAfterSettle);

    // 工具轮 + 文本轮 = 2 次请求，有界
    expect(fetchMock.mock.calls.length).toBe(2);
  });

  it("连续两次工具调用后仍能正常收尾（多工具场景）", async () => {
    let toolCalls = 0;
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      // 前两次请求返回工具调用（search-species → add-species），之后纯文本收尾
      const stream =
        toolCalls < 2
          ? (toolCalls++, toolStream(toolCalls === 1 ? "search-species" : "add-species", "call_" + toolCalls))
          : textStream("构建完成");
      void init;
      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getByText, getByTestId } = render(<Harness />);
    act(() => {
      fireEvent.click(getByText("send"));
    });

    await waitIdle(() => getByTestId("status").textContent, 15000);
    const callsAfterSettle = fetchMock.mock.calls.length;
    await new Promise((r) => setTimeout(r, 1500));
    expect(fetchMock.mock.calls.length).toBe(callsAfterSettle);

    // 2 次工具 + 1 次文本收尾 = 3 次请求
    expect(fetchMock.mock.calls.length).toBe(3);
  });
});
