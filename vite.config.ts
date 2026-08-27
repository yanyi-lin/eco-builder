import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
  },
  server: {
    // 平台预览代理访问所需的主机白名单
    allowedHosts: [".monkeycode-ai.online"],
    // 本地开发：前端 5173 → 后端 3000（npm run dev:server）。
    // 生产部署为同源（Node 服务直接出静态 + /api），无需代理。
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
  define: {
    // 暴露给前端的直连开关（仅本地测试用）
    "import.meta.env.VITE_DIRECT_OPENAI": JSON.stringify(process.env.VITE_DIRECT_OPENAI ?? ""),
  },
});
