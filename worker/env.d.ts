import type { TokenCounter } from "./TokenCounter";

/** Worker 环境变量与绑定类型 */
export interface Env {
  /** Durable Object 绑定：EcoChatAgent */
  ECO_CHAT: DurableObjectNamespace;
  /** Durable Object 绑定：全局请求计数器 TokenCounter（固定 name 实例聚合全局限额） */
  ECO_COUNTER: DurableObjectNamespace<TokenCounter>;
  /** 静态资源绑定（Vite 构建产物） */
  ASSETS: Fetcher;
  /** OpenAI 兼容 API base URL，如 https://api.openai.com/v1 */
  OPENAI_BASE_URL: string;
  /** OpenAI 兼容 API Key（secret） */
  OPENAI_API_KEY: string;
  /** 模型名，如 gpt-4o-mini */
  OPENAI_MODEL: string;
}
