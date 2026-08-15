// ========================= AI 工具 schema（迁移自 worker/EcoChatAgent.ts） =========================
// Worker 端只声明 schema，实际执行在浏览器端 onToolCall（src/tools/ecoTools.ts /
// builderTools.ts）——迁移后架构不变：Node 服务端仍只声明 schema 并交给 LLM。
// 12 个工具与 CF 版完全一致（MIGRATION-PLAN §4 行为等价基准）。

import { tool, type ToolSet } from "ai";
import { z } from "zod";

/**
 * 构建 AI 工具集（模拟模式 5 个 + 构建模式 7 个）。
 * 前端 useEcoAgent 的 onToolCall 按 toolName 分发到 executeTool / executeBuilderTool。
 */
export function buildTools(): ToolSet {
  return {
    // === 模拟模式工具 ===
    "read-animal-data": tool({
      description:
        "读取当前模拟器的物种列表、各物种数量、关系与运行状态。调用 animal-population-set 前必须先调用本工具。",
      inputSchema: z.object({}),
    }),
    "animal-population-set": tool({
      description:
        "设置物种数量（仅种群，不含模型参数）。部分更新：可以传入物种 id 和对应数量。未提供的物种保持不变。低于该物种最小阈值会自动 clamp。",
      inputSchema: z.object({}).passthrough(),
    }),
    "start": tool({
      description: "启动或继续模拟。",
      inputSchema: z.object({}),
    }),
    "pause": tool({
      description: "暂停模拟。",
      inputSchema: z.object({}),
    }),
    "restart": tool({
      description: "重置模拟到初始状态。",
      inputSchema: z.object({}),
    }),

    // === 构建模式工具 ===
    "search-species": tool({
      description: "从 GBIF 搜索物种分类信息。返回物种的拉丁名、分类、匹配置信度等。",
      inputSchema: z.object({
        query: z.string().describe("物种名称（中文或拉丁名）"),
      }),
    }),
    "query-interactions": tool({
      description: "从 GloBI 查询两个物种间的交互关系。返回交互类型（捕食/竞争/互利等）。",
      inputSchema: z.object({
        species1: z.string().describe("物种1的拉丁名"),
        species2: z.string().describe("物种2的拉丁名"),
      }),
    }),
    "add-species": tool({
      description: "添加一个物种到构建中的模型。growthRate/carryingCapacity/deathRate 传数值，代码自动处理参数键。仅添加用户明确提到的物种，禁止擅自添加额外物种。",
      inputSchema: z.object({
        id: z.string().describe("物种 id（英文，如 'rabbit'）"),
        name: z.string().describe("显示名（如 '草兔'）"),
        color: z.string().optional().describe("曲线颜色（可选，如 '#4caf50'）"),
        initial: z.number().optional().describe("初始种群数量"),
        hasLogistic: z.boolean().optional().describe("是否有环境容纳量限制（植物/资源物种为 true）"),
        growthRate: z.number().optional().describe("增长率 r（数值，如 0.3）"),
        carryingCapacity: z.number().optional().describe("环境容纳量 K（数值，如 200）"),
        deathRate: z.number().optional().describe("自然死亡率（数值，如 0.15）"),
      }),
    }),
    "add-relation": tool({
      description: "添加一个关系到构建中的模型。只需传 type 和物种，捕食率等系数自动生成。",
      inputSchema: z.object({
        type: z.enum(["predation", "competition", "mutualism"]).describe("关系类型"),
        prey: z.string().optional().describe("被捕食者 id（predation 时必填）"),
        predator: z.string().optional().describe("捕食者 id（predation 时必填）"),
        species1: z.string().optional().describe("物种1 id（competition/mutualism 时必填）"),
        species2: z.string().optional().describe("物种2 id"),
      }),
    }),
    "get-current-model": tool({
      description: "获取当前构建中的模型状态（物种、关系、参数）。",
      inputSchema: z.object({}),
    }),
    "build-model": tool({
      description: "构建模型（生成 EcoModelSpec）。",
      inputSchema: z.object({
        name: z.string().optional().describe("模型名称"),
        description: z.string().optional().describe("模型描述"),
      }),
    }),
    "run-model": tool({
      description: "构建并运行模型（切换到模拟模式）。",
      inputSchema: z.object({
        name: z.string().optional().describe("模型名称"),
        description: z.string().optional().describe("模型描述"),
      }),
    }),
  };
}
