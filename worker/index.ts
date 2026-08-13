import { routeAgentRequest } from "agents";
import type { Env } from "./env.d";

// 导出 Durable Object 类（Wrangler 需要在入口能找到）
export { EcoChatAgent } from "./EcoChatAgent";
export { TokenCounter } from "./TokenCounter";

// 允许的前端来源白名单（不反射任意 Origin，防止跨站请求伪造）
const ALLOWED_ORIGINS = new Set([
  "https://eco-agent.yanyi-lin.workers.dev",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

/** 构造安全响应头（防 XSS / 点击劫持 / MIME 嗅探 / 降级） */
function securityHeaders(extra: HeadersInit = {}): HeadersInit {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    ...extra,
  };
}

/** 判断请求来源是否在白名单内；返回允许的 Origin 值或 null（应拒绝） */
function allowedOrigin(req: Request): string | null {
  const origin = req.headers.get("Origin");
  if (!origin) return null; // 无 Origin（同源 GET/非 CORS 请求）不需要 CORS 头
  return ALLOWED_ORIGINS.has(origin) ? origin : null;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    // 处理 CORS 预检请求 (OPTIONS)
    if (req.method === "OPTIONS") {
      const origin = allowedOrigin(req);
      // 非白名单来源：拒绝预检（无 CORS 头 → 浏览器阻止跨域）
      if (!origin) {
        return new Response(null, { status: 204, headers: securityHeaders() });
      }
      return new Response(null, {
        status: 204,
        headers: securityHeaders({
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": req.headers.get("Access-Control-Request-Headers") || "*",
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Max-Age": "86400",
        }),
      });
    }

    // 1. 先尝试路由到 Agent（WebSocket / RPC）
    let routed = await routeAgentRequest(req, env);
    if (routed) {
      // WebSocket 升级 (101) 或 204/304 响应不能/不需要重新构造，直接返回原响应
      if (routed.status === 101 || routed.status === 204 || routed.status === 304) {
        return routed;
      }

      // 保证所有 HTTP Agent 响应都带上正确的 CORS 头部（仅白名单来源）
      const origin = allowedOrigin(req);
      const headers = new Headers(securityHeaders(routed.headers));
      if (origin) {
        headers.set("Access-Control-Allow-Origin", origin);
        headers.set("Access-Control-Allow-Credentials", "true");
      }
      return new Response(routed.body, {
        status: routed.status,
        statusText: routed.statusText,
        headers,
      });
    }

    // 2. 否则作为静态资源（Vite 构建产物）返回，支持 SPA fallback
    const staticRes = await env.ASSETS.fetch(req);
    // 给静态资源也加上安全响应头
    const headers = new Headers(securityHeaders(staticRes.headers));
    return new Response(staticRes.body, {
      status: staticRes.status,
      statusText: staticRes.statusText,
      headers,
    });
  },
};
