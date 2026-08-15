# ========================= eco-builder Docker 镜像（备选部署方式） =========================
# 主推部署方式为宝塔面板 pm2（见 README「宝塔面板部署」）；本 Dockerfile 供有
# Docker 环境的服务器使用（需要 SSH 操作）。多阶段构建：
#   阶段1 build：装依赖 + 编译前端(dist/) + 编译后端(dist-server/)
#   阶段2 runtime：仅 node + 产物 + 生产依赖（不含源码/构建工具）
#
# 构建：docker build -t eco-builder .
# 运行：docker run -d --name eco-builder -p 3000:3000 \
#         -e OPENAI_API_KEY=sk-xxx -e OPENAI_BASE_URL=https://api.deepseek.com \
#         -e OPENAI_MODEL=deepseek-v4-flash -e PORT=3000 eco-builder

# ---- 构建阶段 ----
FROM node:22-alpine AS build
WORKDIR /app
# 先拷依赖清单（利用层缓存）
COPY package.json package-lock.json ./
RUN npm ci
# 拷源码并构建（前端 dist/ + 后端 dist-server/）
COPY . .
RUN npm run build

# ---- 运行阶段 ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# 生产依赖（express/dotenv/ai 等运行时需要）
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
# 前端构建产物 + 后端编译产物
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
# 非 root 运行（更安全）
USER node
EXPOSE 3000
CMD ["node", "dist-server/index.js"]
