# MockMate Agent

求职者侧智能面试 Agent：**职业档案 → 简历定制 → 模拟面试 → 能力诊断 → 定向复训** 的闭环。

个人项目，带学习性质：本地优先，可部署到免费平台（国内优先）个人使用。

## 核心能力

- **C1 简历定制**：结合个人经历与目标岗位 JD 生成可溯源的定制简历；也可以不针对 JD，按档案和简历标准生成主简历
- **C2 面试训练**：基于岗位要求进行多轮、可追问的模拟面试（文字 → 语音）
- **C3 诊断与复训**：多维 Rubric 诊断短板，并自动生成针对性训练

## 文档

| 文档 | 说明 |
|---|---|
| [01 · 产品需求](docs/01-requirements.md) | 目标与定位、功能需求（带编号）、非功能需求、洞见、风险、量化证据 |
| [02 · 技术选型与技术架构](docs/02-architecture.md) | 选型与待定项、分层与依赖规则、工程结构、模型层、LangGraph 运行时、检索、数据层、部署 |
| [03 · 落地计划](docs/03-delivery-plan.md) | 里程碑、分阶段任务（验收 / 需求 / 学习点）、待补项、决策点、进度跟踪 |
| [04 · 代码地图](docs/04-code-map.md) | **新人先读**：目录与文件逐一说明、请求链路、前端 / 后端 / 智能体交互图、推荐阅读顺序 |

> 后续开发以上述文档为基准，技术选型或架构边界变更需先更新 `docs/02-architecture.md`。

## 目录速览

```text
src/
├── frontend/   前端：React SPA（页面、组件、请求 hooks、流式对话）
├── backend/    后端：server（HTTP）/ core（用例）/ db（数据）/ jobs（后台任务）
├── agent/      智能体：graphs（LangGraph）/ llm（模型网关）/ prompts …（运行在后端进程内）
└── shared/     公共底座：domain（纯函数规则）/ env（配置）/ common（错误码、日志、ctx）
```

每个目录下有 `README.md`，每个源码文件顶部有 `@file` 说明。

## 技术栈概览

- **形态**：单仓、单个 Node 进程（API + 静态资源 + 进程内任务）+ PostgreSQL
- **前端**：Vite · React · React Router · Tailwind + shadcn/ui · TanStack Query · AI SDK UI（`useChat` / `useObject`）
- **后端**：Hono · Hono RPC（前后端共享类型）· Zod · Drizzle · pg-boss · pino
- **Agent**：LangGraph.js（`PostgresSaver` 存档、`interrupt` 中断恢复、`Send` 并行）· LangChain 模型类
- **模型**：自研模型注册表，业务只用别名（`chat` / `judge` / `extract` / `fallback` / `embed`），换 provider 只改环境变量
- **检索**：PostgreSQL + pgvector（HNSW）+ 结构化过滤，可选关键词召回与重排
- **部署**：本地 docker compose；线上首选魔搭 Docker 创空间（单镜像内置 Postgres）

## 本地运行

需要 Node ≥ 22、pnpm、Docker。

```bash
cp .env.example .env          # 默认使用离线 fake 模型，无需 Key 即可跑通
docker compose up -d db       # 启动 Postgres + pgvector
pnpm install
pnpm db:migrate
pnpm dev                      # 前端 http://localhost:5173（代理 /api 到后端 :3000）
```

局域网 / 远程机器访问：前端默认只监听 `localhost`，在 `.env` 里设 `DEV_HOST=0.0.0.0` 与 `DEV_PORT=5199`（或 `DEV_HOST=0.0.0.0 DEV_PORT=5199 pnpm dev`），即可用 `http://<本机IP>:5199` 打开；`/api` 仍由 Vite 代理到本机后端，后端无需暴露端口。用域名而非 IP 访问时还需在 `vite.config.ts` 的 `server.allowedHosts` 中加入该域名。

- 首页「系统状态」：服务 / 数据库检查，各模型别名的 Ping
- `/dev/echo`：LangGraph 回声图，验证逐字流式、中断恢复（开发环境默认开启）
- 接入真实模型：在 `.env` 的 `PROVIDERS` 中加入 provider，填写 `PROVIDER_<NAME>_*`，再把 `MODEL_*` 指向 `<provider>:<model>`，重启即可
- 数据库容器的查看、停止与权限问题见下文「本地数据库（Docker Compose）」
- 迁移何时需要重跑、不迁移直接 `pnpm dev` 的后果见下文「数据库迁移（`pnpm db:migrate`）」

## 常用命令

| 命令 | 说明 |
|---|---|
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | 代码检查（含分层依赖约束）/ 类型检查 / 格式化 |
| `pnpm test` | 单元测试 + 图测试（假模型 + MemorySaver，不依赖数据库） |
| `pnpm test:integration` | 集成测试，需要 `mockmate_test` 库（或设置 `TEST_DATABASE_URL`） |
| `pnpm db:generate` / `pnpm db:migrate` | 由 `src/backend/db/schema` 生成迁移 / 执行迁移 |
| `pnpm build` && `pnpm start` | 生产构建，单进程同时托管前端与 `/api` |
| `docker build -t mockmate .` | 魔搭单镜像（Node + 内置 Postgres，监听 7860，数据在 `/mnt/workspace`） |

集成测试库首次创建：`docker compose exec db psql -U mockmate -c "create database mockmate_test"`。

## 本地数据库（Docker Compose）

以下命令均在仓库根目录执行；不在根目录时加 `-f /path/to/docker-compose.yml` 或 `-p mockmate`。

### `docker compose up -d db` 做了什么

`up` 创建并启动服务，`-d` 后台运行，`db` 表示只启动该服务（`app` 挂在 `profiles: ['app']` 下，默认不启动）。

```text
docker compose up -d db
  |
  +-> [1] 读取 docker-compose.yml 与同目录 .env（DB_PORT 等）
  +-> [2] 项目名 mockmate（来自顶层 name:）
  +-> [3] 创建网络 mockmate_default      （不存在时）
  +-> [4] 创建数据卷 mockmate_pgdata     （不存在时）
  +-> [5] 拉取镜像 pgvector/pgvector:pg17（本地没有时）
  +-> [6] 创建并启动容器 mockmate-db-1
  |         环境变量  用户 / 密码 / 库名均为 mockmate
  |         端口映射  宿主机 ${DB_PORT:-5432} -> 容器 5432
  |         卷挂载    mockmate_pgdata -> /var/lib/postgresql/data
  |         重启策略  unless-stopped（手动 stop 后不再自动拉起）
  +-> [7] 后台运行，每 5s 执行 pg_isready 健康检查
            starting -> healthy / unhealthy
```

要点：

- 镜像预装 pgvector 向量扩展；扩展由迁移中的 `create extension` 启用（见 `db/`）。
- `environment` 只在数据卷为空的首次初始化时生效；卷中已有数据后改密码不会生效，需 `down -v` 重置。
- 宿主机连接串：`postgres://mockmate:mockmate@localhost:5432/mockmate`。
- 数据持久化在命名卷 `mockmate_pgdata`，删除容器不丢数据。
- `app` 服务用 `depends_on: condition: service_healthy`，等健康检查通过后才启动。

### 查看

| 命令 | 说明 |
|---|---|
| `docker compose ps` | 服务状态，含 healthy / unhealthy 与端口 |
| `docker compose logs -f db` | 实时日志（`--tail=100` 只看最后 100 行） |
| `docker compose exec db psql -U mockmate -d mockmate` | 进入 psql：`\l` 库、`\dt` 表、`\dx` 扩展、`\q` 退出 |
| `docker inspect --format '{{.State.Health.Status}}' mockmate-db-1` | 只看健康状态 |
| `docker volume ls \| grep pgdata` / `docker stats mockmate-db-1` | 数据卷 / 资源占用 |

### 关闭（影响由小到大）

| 命令 | 影响 |
|---|---|
| `docker compose stop db` | 仅停止容器，容器与数据保留，`docker compose start db` 恢复 |
| `docker compose down` | 停止并删除容器与网络，**数据卷保留**，数据不丢 |
| `docker compose down -v` | 同时删除 `mockmate_pgdata`，**数据永久清空**，仅用于重置数据库 |

### 排查：permission denied on /var/run/docker.sock

```text
permission denied while trying to connect to the Docker daemon socket
at unix:///var/run/docker.sock
```

`docker` 只是客户端，需通过 `/var/run/docker.sock`（属主 `root`、属组 `docker`、权限 `rw-rw----`）访问守护进程。当前用户既非 root 又不在 `docker` 组时被拒绝，命令不会产生任何实际效果。

先确认现状：`id`、`ls -l /var/run/docker.sock`、`getent group docker`。两种处理方式：

```bash
sudo docker compose down          # 临时：加 sudo
sudo usermod -aG docker $USER     # 长期：加入 docker 组
newgrp docker                     # 当前终端立即生效（或重新登录）
docker ps                         # 验证
```

> 加入 `docker` 组基本等同于获得 root 权限（可通过挂载宿主机目录提权），共享机器上请先确认符合团队安全规范，否则用 `sudo`。

## 数据库迁移（`pnpm db:migrate`）

把 `db/migrations/` 下的 SQL 按顺序应用到 `DATABASE_URL` 指向的库，并记录已应用的版本；可重复执行。表结构的源头是 `src/backend/db/schema/*.ts`，改完先 `pnpm db:generate` 生成 SQL，再执行本命令。

### 做了什么

```text
pnpm db:migrate
  |
  +-> tsx src/backend/db/migrate-cli.ts
        +-> import '@/shared/env/load'          载入 .env（不覆盖已有变量）
        +-> runMigrations()  src/backend/db/migrate.ts
        |     +-> getPool()                     建 pg.Pool，读 DATABASE_URL / DB_POOL_MAX
        |     +-> pool.connect()                取一条连接
        |     +-> pg_advisory_lock(hashtext())  全局咨询锁，避免多实例 / 重启并发迁移
        |     +-> drizzle migrate()             逐个应用未执行的 SQL
        |     +-> pg_advisory_unlock() + release
        +-> closePool()                         关连接池，进程退出
```

当前的两个迁移：`0000_extensions.sql` 启用 `vector` 与 `pg_trgm`；`0001_init.sql` 建 `users` / `llm_calls`（含外键与索引）。`langgraph.*` 由 `checkpointer.setup()` 创建、`pgboss.*` 由 pg-boss 启动时创建，都不走这里。

### 为什么可以重复执行

```text
首次运行 -> 建表 drizzle.__drizzle_migrations（记录每个迁移的 hash 与时间）
                      |
再次运行 -> 读该表 --> 比对 db/migrations/meta/_journal.json
                      +-- hash 已存在 -> 跳过
                      +-- 新增迁移     -> 执行并写入记录
```

迁移结果落在数据卷 `mockmate_pgdata` 里，不是进程内状态。查看已应用的版本：

```bash
docker compose exec db psql -U mockmate -d mockmate -c 'select hash, created_at from drizzle.__drizzle_migrations order by created_at;'
```

### 什么时候需要重新执行

| 场景 | 是否需要 | 原因 |
|---|---|---|
| 重启机器 / `docker compose stop`、`start` | 不需要 | 数据卷与表都还在 |
| `docker compose down`（不带 `-v`） | 不需要 | 只删容器与网络，卷保留 |
| 拉到新代码后 `db/migrations/` 多了文件 | **需要** | 有未应用的迁移 |
| 自己改 `schema/*.ts` 并跑过 `pnpm db:generate` | **需要** | 同上 |
| `docker compose down -v` 或手动删卷 | **需要** | 数据已清空，等于全新库 |

### 不迁移直接 `pnpm dev` 会怎样

`.env` 的 `MIGRATE_ON_START` 默认 `false`，`startRuntime()` 不会自动补迁移，后端会在第一个碰库的步骤失败并退出：

```text
pnpm dev
  +-- dev:client  vite                      能起（纯前端，不碰 DB）
  +-- dev:server  entry.ts
        +-> serverEnv()                     只校验 .env 格式，不连库
        +-> startRuntime()
        |     +-> assertRegistry()          校验模型注册表
        |     +-> MIGRATE_ON_START=false -> 跳过迁移
        |     +-> ensureUser(DEV_USER_ID)   X 第一个真正碰库的操作
        |     +-> setupCheckpointer()         （到不了）
        |     +-> pg-boss start               （到不了）
        +-> logger.fatal 'failed to start' -> exit(1)
                      |
      concurrently -k  +-> 连带 kill 掉 vite，整个 pnpm dev 结束
```

两种报错形态：

| 情况 | 首个报错 |
|---|---|
| db 容器没起 | `connect ECONNREFUSED 127.0.0.1:5432` |
| 容器起了但没迁移 | `relation "users" does not exist`（来自 `ensureUser`） |

因此正确顺序是 `docker compose up -d db`（等 `docker compose ps` 显示 healthy）→ `pnpm db:migrate` → `pnpm dev`。本地嫌麻烦可在 `.env` 设 `MIGRATE_ON_START=true`，迁移会在 `ensureUser` 之前自动执行（有 advisory lock 保护）；生产维持 `false`，把迁移作为独立部署步骤。

