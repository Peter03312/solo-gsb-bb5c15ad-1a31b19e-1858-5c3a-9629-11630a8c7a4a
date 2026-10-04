# ---- 构建前端 ----
FROM node:20-bookworm-slim AS web-build
WORKDIR /app/web
COPY web/package.json ./
RUN npm install
COPY web/ ./
RUN npm run build

# ---- 安装后端依赖（better-sqlite3 使用预编译二进制）----
FROM node:20-bookworm-slim AS server-deps
WORKDIR /app/server
COPY server/package.json ./
RUN npm install --omit=dev

# ---- 运行镜像（单容器：Express 同时提供 API 与前端静态文件）----
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV DB_PATH=/app/data/orienteering.sqlite
ENV WEB_DIST=/app/web/dist
ENV SEED_DEMO=1

COPY server/ ./server/
COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY --from=web-build /app/web/dist ./web/dist

RUN mkdir -p /app/data
VOLUME ["/app/data"]
EXPOSE 8080

# 启动时自动建表并初始化数据库（库为空且 SEED_DEMO=1 时写入演示赛事）
CMD ["node", "server/index.js"]
