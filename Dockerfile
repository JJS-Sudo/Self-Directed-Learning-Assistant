# ───────────────────────── 构建阶段 ─────────────────────────
# 不用 `# syntax=docker/dockerfile:1`：它会让 BuildKit 去 auth.docker.io 拉前端镜像，
# 在没有外网 / 只有 IPv6 出口的机器上会直接失败；本文件只用标准指令。
FROM node:22-slim AS builder
WORKDIR /app

# better-sqlite3 若没有可用预编译包，需要就地编译
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json vite.config.ts ./
COPY src ./src
COPY web ./web
COPY seeds ./seeds

RUN npm run build && npm prune --omit=dev

# ───────────────────────── 运行阶段 ─────────────────────────
FROM node:22-slim AS runner

ENV NODE_ENV=production \
    HOST=127.0.0.1 \
    PORT=3000 \
    SDL_VAULT_PATH=/data/vault

WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/seeds ./seeds
COPY bin ./bin
COPY docker/entrypoint.sh /usr/local/bin/sdl-entrypoint

RUN chmod +x /usr/local/bin/sdl-entrypoint \
  && mkdir -p /data/vault \
  && chown -R node:node /data /app

USER node
VOLUME ["/data"]
EXPOSE 3000

ENTRYPOINT ["sdl-entrypoint"]
CMD ["node", "dist/index.js"]
