# syntax=docker/dockerfile:1.7
# 生产单镜像：Node + 内置 PostgreSQL(pgvector)，用于魔搭 Docker 创空间（02 §10.2）
# 国内构建可替换：
#   --build-arg NODE_IMAGE=<镜像加速地址>/library/node:22-bookworm-slim
#   --build-arg DEBIAN_MIRROR=https://mirrors.aliyun.com/debian
#   --build-arg PGDG_MIRROR=https://mirrors.tuna.tsinghua.edu.cn/postgresql/repos/apt
#   --build-arg NPM_REGISTRY=https://registry.npmmirror.com
ARG NODE_IMAGE=node:22-bookworm-slim
ARG PG_MAJOR=17

# ---------- 构建阶段 ----------
FROM ${NODE_IMAGE} AS build
ARG NPM_REGISTRY=https://registry.npmjs.org
WORKDIR /app
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true COREPACK_NPM_REGISTRY=${NPM_REGISTRY} npm_config_registry=${NPM_REGISTRY}
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod --ignore-scripts

# ---------- 运行阶段 ----------
FROM ${NODE_IMAGE} AS runtime
ARG PG_MAJOR
ARG DEBIAN_MIRROR=
ARG PGDG_MIRROR=https://apt.postgresql.org/pub/repos/apt

RUN set -eux; \
    if [ -n "${DEBIAN_MIRROR}" ]; then \
      sed -i "s|http://deb.debian.org/debian|${DEBIAN_MIRROR}|g" /etc/apt/sources.list.d/debian.sources; \
    fi; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl tini; \
    install -d /usr/share/postgresql-common/pgdg; \
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc; \
    echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] ${PGDG_MIRROR} bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends postgresql-${PG_MAJOR} postgresql-${PG_MAJOR}-pgvector; \
    rm -rf /var/lib/apt/lists/*

ENV PATH=/usr/lib/postgresql/${PG_MAJOR}/bin:$PATH \
    NODE_ENV=production \
    PORT=7860 \
    HOST=0.0.0.0 \
    MIGRATE_ON_START=true \
    DATA_ROOT=/mnt/workspace \
    USE_EMBEDDED_PG=true

WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY db/migrations ./db/migrations
COPY db/seeds ./db/seeds
COPY deploy/modelscope/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 7860
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/api/healthz" || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
