# 04 · 代码地图（学习用）

> 本文面向**第一次读这个仓库的人**：每个目录做什么、应该放什么、每个文件做什么、它们怎么配合，以及前端 / 后端 / 智能体的交互方式。
> 架构的"为什么"见 [02 · 技术架构](02-architecture.md)，进度见 [03 · 落地计划](03-delivery-plan.md)。
> 每个源码文件顶部都有 `@file` 注释，每个目录下都有 `README.md`，可以和本文对照阅读。

## 0. 一句话总结

项目目标是做一个"求职面试 Agent"（简历定制 → 模拟面试 → 诊断复训）。**当前处于 P0：业务功能还没开始写，写好的是整套技术骨架**，并用一张"回声图（echo）"把 **前端 → 后端 → LangGraph → 模型 → 数据库 → 流式返回前端** 的全链路跑通了。echo 是未来面试图的缩小版样板。

---

## 1. 顶层目录：前端 / 后端 / 智能体

```text
mock-mate-agent/
│
├── src/
│   ├── frontend/        【前端】浏览器里跑，Vite 打包 → dist/client
│   │
│   ├── backend/         【后端】Node 进程里跑，tsup 打包 → dist/server
│   │   ├── server/          HTTP 入口：Hono 中间件 + 路由 + 进程启动
│   │   ├── core/            用例层：业务流程编排（调图、写库、入队）
│   │   ├── db/              数据访问：表结构、仓储、迁移、连接池
│   │   └── jobs/            后台任务：pg-boss 队列 / 定时任务
│   │
│   ├── agent/           【智能体】AI 相关，运行在后端进程内（不是独立服务）
│   │   ├── graphs/          LangGraph 图：状态、节点、边、存档、流式转换
│   │   ├── llm/             模型网关：注册表、provider、降级、结构化输出、用量
│   │   ├── prompts/         Prompt 文本（带版本号）
│   │   ├── tools/       ○   LLM 可调用的只读工具            (P1 起)
│   │   ├── retrieval/   ○   向量检索器（题库 / 事实）        (P1 起)
│   │   ├── rubrics/     ○   评分标准定义                     (P2b 起)
│   │   └── voice/       ○   语音 ASR/TTS 适配                (P4 起)
│   │
│   └── shared/          【公共底座】
│       ├── domain/          纯函数业务规则（图的条件边判断在这里）
│       ├── schemas/     ○   Zod 领域定义（唯一的类型来源）    (P1 起)
│       ├── env/             环境变量校验（server.ts 仅后端，client.ts 仅前端）
│       └── common/          ctx、错误码、日志、id
│
├── db/              数据库迁移 SQL 与种子数据（drizzle-kit 生成）
├── tests/           集成测试与测试工具（单元测试与源码同目录，*.test.ts）
├── deploy/          部署脚本（魔搭单镜像）
├── docs/            需求 / 架构 / 计划 / 代码地图
├── public/          前端静态资源（原样拷贝）
└── 根目录配置        vite / tsup / drizzle / vitest / eslint / docker ...

○ = 已规划、ESLint 规则已预留，但目录尚未创建（到对应阶段再建）
```

### 1.1 为什么 domain 放在 shared，不放 agent

`shared/domain` 是**纯业务规则**（零 IO、零 SDK），例如"答完一题后该追问还是下一题""技能缺口怎么算"。它既被智能体（图的条件边）使用，也被后端用例（如简历导出前的校验）使用，所以属于公共底座。

### 1.2 分层依赖规则（ESLint 强制）

规则写在 `eslint.config.js` 的 `LAYER_DEPS` 中，违反时 `pnpm lint` 直接报错：

```text
frontend        -> shared/schemas, shared/common(仅 errors.ts), shared/env(仅 client.ts),
                   backend/server(仅 import type AppType)
backend/server  -> backend/core, shared/*
backend/core    -> agent/{graphs,llm,retrieval,voice}, backend/{jobs,db}, shared/*
backend/jobs    -> backend/core（handler 只调 core）
agent/graphs    -> agent/{tools,retrieval,prompts,rubrics,llm}, backend/db, shared/{domain,schemas,common}
agent/llm       -> shared/{schemas,common,env}            （不依赖 db！）
backend/db      -> shared/{schemas,common,env}
shared/domain   -> shared/schemas                          零 IO、零三方 SDK
```

另外三条硬约束：

- `backend/core`、`backend/db`、`backend/jobs`、`agent/*`、`shared/*` 不得 import `hono` 或 `react`。
- `frontend` 不得 import Node API 或服务端 SDK（`pg`、`@langchain/*` 等）；对后端只允许 `import type`。
- 密钥只在 `shared/env/server.ts` 中读取。

---

## 2. 逐目录、逐文件说明

### 2.1 根目录配置

| 文件 | 做什么 |
|---|---|
| `package.json` | 依赖与脚本；`pnpm dev` 同时启动前端（Vite :5173）与后端（tsx watch :3000） |
| `tsconfig.json` | TS 配置；`@/*` 别名指向 `src/*`（如 `@/backend/core/dev.service`） |
| `index.html` | 前端 SPA 的 HTML 入口，加载 `src/frontend/main.tsx` |
| `vite.config.ts` | 前端构建：开发时把 `/api` 代理到后端；产物输出 `dist/client` |
| `tsup.config.ts` | 后端打包：`src/backend/server/entry.ts` → `dist/server/entry.js`（另含迁移 CLI） |
| `drizzle.config.ts` | drizzle-kit 读 `src/backend/db/schema` 生成迁移到 `db/migrations` |
| `vitest.config.ts` | 测试分 `unit`（无 DB）和 `integration`（真实 Postgres）两个 project |
| `eslint.config.js` | 常规规则 + **分层依赖约束**（§1.2） |
| `components.json` | shadcn/ui 配置：`npx shadcn add xxx` 会把组件生成到 `src/frontend/components/ui` |
| `docker-compose.yml` | 本地 `pgvector` 数据库（可选 app、langfuse） |
| `Dockerfile` | 生产单镜像：Node + 内置 Postgres |
| `.env` / `.env.example` | 环境变量；默认 `fake` 模型，离线可跑 |

### 2.2 `db/`、`tests/`、`deploy/`、`docs/`、`public/`

| 路径 | 做什么 |
|---|---|
| `db/migrations/0000_extensions.sql` | 启用 `vector`、`pg_trgm` 扩展 |
| `db/migrations/0001_init.sql` | 建 `users`、`llm_calls` 表 |
| `db/migrations/meta/*` | drizzle-kit 快照与日志，自动维护，勿手改 |
| `db/seeds/{questions,rubrics}/` | 题库 / 评分标准种子数据（P2a / P2b 填充） |
| `tests/helpers/env.ts` | 测试工具：注入测试环境变量（fake 模型）、读取整条流 |
| `tests/integration/p0.test.ts` | 集成测试：迁移、readyz、用量入库、"中断 → 模拟进程重启 → 恢复" |
| `deploy/modelscope/entrypoint.sh` | 容器启动：初始化并启动内置 PG → 启动 Node → SIGTERM 时先停 Node 再停 PG |
| `docs/01~04` | 需求 / 架构 / 计划 / 本文 |
| `public/favicon.svg` | 静态资源 |

**数据库变更流程**：改 `src/backend/db/schema/*.ts` → `pnpm db:generate`（生成 SQL 到 `db/migrations`）→ `pnpm db:migrate`。
拉到新迁移、或删过数据卷后需重跑 `pnpm db:migrate`；`MIGRATE_ON_START` 默认 `false`，漏跑时 `pnpm dev` 会在 `ensureUser` 处启动失败。执行过程与排查见根 [README 「数据库迁移」](../README.md#数据库迁移pnpm-dbmigrate)。

---

### 2.3 `src/frontend/`：前端

```text
frontend/
├── main.tsx              入口：QueryClient（重试策略）+ RouterProvider
├── router.tsx            路由表：按路由懒加载；未上线页面指向 placeholder
├── nav.ts                侧边栏菜单定义；phase 标出计划上线阶段
├── index.css             Tailwind 入口与主题变量
├── routes/               页面（一个文件 = 一个 URL）
│   ├── root-layout.tsx   外壳：侧边栏 + <Outlet/>
│   ├── home.tsx          "系统状态"：healthz / readyz / 各模型 Ping
│   ├── dev-echo.tsx      回声图调试页：useChat 流式对话、存档恢复
│   ├── placeholder.tsx   未上线页面占位
│   └── not-found.tsx     404
├── features/<领域>/      按业务领域组织的数据 hooks 与业务组件
│   ├── system/queries.ts     useMeta / useHealth / useReady / usePing
│   └── dev-echo/queries.ts   useEchoThread（从存档恢复对话）
├── components/ui/        shadcn 基础组件：button / card / badge / textarea
└── lib/
    ├── api.ts            hc<AppType> 类型安全客户端 + unwrap + ApiClientError + parseStreamError
    ├── chat-transport.ts useChat 的 transport：只发本轮回答
    └── utils.ts          cn()：合并 className
```

| 要加的东西 | 放哪里 |
|---|---|
| 新页面 | `routes/xxx.tsx` → 在 `router.tsx` 注册 → 在 `nav.ts` 去掉 `phase` |
| 某业务的请求 hooks、业务组件 | `features/<领域>/{queries.ts, components/, hooks/}`，如未来的 `features/interview/` |
| 通用 UI | `components/ui/`（用 shadcn 生成） |
| 浏览器端 PDF 文本提取（P1） | `lib/pdf-text.ts`（原文件不上传） |

**怎么工作**：页面 → `features/*/queries.ts` 的 hook → `lib/api.ts`（路径与返回类型来自后端 `AppType`）。流式对话用 `useChat` 加 `lib/chat-transport.ts`。

---

### 2.4 `src/backend/server/`：HTTP 层（只管"进门"，不写业务）

| 文件 | 做什么 |
|---|---|
| `entry.ts` | 进程入口：校验 env → `startRuntime()` → `createApp()` → 生产环境托管静态资源和 SPA fallback → 监听 → 优雅停机 |
| `app.ts` | 组装 Hono：中间件链 + `/api` 子路由；**导出 `type AppType` 给前端** |
| `types.ts` | `AppEnv`（`c.var` 里有什么）+ `toCtx(c)`，把 Hono 上下文转换为 `RequestCtx` |
| `validate.ts` | 包装 zod-validator：失败统一抛 `AppError('VALIDATION')` |
| `middleware/request-id.ts` | 生成或透传 requestId，挂请求级 logger，记录访问日志 |
| `middleware/access-gate.ts` | 公网访问口令（签名 Cookie）；未通过时 API 返回 401，页面返回口令页 |
| `middleware/dev-user.ts` | 单用户模式：注入固定 `DEV_USER_ID` |
| `middleware/rate-limit.ts` | 进程内存限流 |
| `middleware/error.ts` | 统一错误输出 `{code,message,requestId}` + 404 |
| `routes/health.ts` | `GET /api/healthz`、`GET /api/readyz` |
| `routes/meta.ts` | `GET /api/meta`（开发路由 / 口令是否开启、模型别名） |
| `routes/access.ts` | `/api/access/status｜login｜logout` |
| `routes/llm.ts` | `GET /api/llm/ping?alias=chat` |
| `routes/dev.ts` | `/api/dev/echo/:threadId`（GET 恢复，POST `/chat` 流式）、存档查看、Mermaid |

**路由文件的标准写法只有三步**：

```text
validate(入参) → 调 core 的函数(toCtx(c), input) → c.json(...) 或返回流式 Response
```

---

### 2.5 `src/backend/core/`：用例层（后端的"大脑"）

| 文件 | 做什么 |
|---|---|
| `runtime.ts` | 启动：校验模型注册表 → 迁移（可选）→ 确保用户 → 建存档表 → pg-boss 与任务；`stopRuntime()` 停机 |
| `dev.service.ts` | 回声图用例：`streamEchoTurn`（判断 start / resume / continue → 调图 → 转流）、`getEchoThread`（存档恢复）、调试函数 |
| `llm.service.ts` | `listModelAliases`、`pingModel` |
| `health.service.ts` | `checkReady`：检查 DB |
| `usage.ts` | `createUsageHandler`：把 `agent/llm` 的用量回调接到 `backend/db` 的写库函数 |
| `backup.service.ts` | `runBackup`：`pg_dump`，保留最近 N 份 |

**应该放什么**：每个业务一个 `xxx.service.ts`（未来有 `profile`、`job`、`resume`、`interview`、`diagnosis`、`training`、`privacy`）。所有函数的第一个参数都是 `ctx: RequestCtx`。这一层负责权限、事务、幂等、加锁、调图、入队、写库。

### 2.6 `src/backend/db/`：数据访问

| 文件 | 做什么 |
|---|---|
| `client.ts` | 唯一的 `pg.Pool`（Drizzle 与 PostgresSaver 共用）、`getDb` / `pingDb` / `closePool` |
| `migrate.ts` / `migrate-cli.ts` | 持 advisory lock 执行迁移 / `pnpm db:migrate` 入口 |
| `schema/index.ts` | 汇总导出所有表 |
| `schema/users.ts`、`schema/llm-calls.ts` | 表定义 |
| `repos/users.ts`、`repos/llm-calls.ts` | 查询函数；**每个方法必须带 `userId`** |

### 2.7 `src/backend/jobs/`：后台任务

| 文件 | 做什么 |
|---|---|
| `index.ts` | `registerJobs(boss)`：注册所有队列，由 `core/runtime.ts` 调用 |
| `backup.ts` | `backup` 队列：handler 只调 `core/backup.service`，按 cron 定时 |

未来会有 `diagnose.ts`（面试结束后异步诊断）、`embed-questions.ts`、`embed-facts.ts`。

---

### 2.8 `src/agent/graphs/`：LangGraph 编排

| 文件 | 做什么 |
|---|---|
| `checkpointer.ts` | PostgresSaver 单例（`langgraph` schema）；每一步状态都落库 → 可中断、可恢复 |
| `config.ts` | `GraphConfigurable {thread_id,userId,requestId}` + `getGraphCtx(config)` |
| `stream.ts` | `graphToUIStream()`：LangGraph 流 → AI SDK UI Message Stream（前后端协议翻译器） |
| `echo/state.ts` | 回声图状态：`messages` / `round` / `maxRounds` / `status` |
| `echo/graph.ts` | 节点 `ask` / `wait_answer`(interrupt) / `reply` / `finish` + 边 + compile |

**一张图的标准结构**（未来 `interview/`、`diagnosis/`、`resume/` 都照此）：

```text
agent/graphs/<图名>/
├── state.ts      状态字段 + reducer
├── graph.ts      addNode / addEdge / addConditionalEdges(调 shared/domain 纯函数) / compile
└── nodes/*.ts    节点多时拆出；节点内调 agent/llm、agent/retrieval、agent/tools、backend/db/repos
```

### 2.9 `src/agent/llm/`：模型网关

| 文件 | 做什么 |
|---|---|
| `providers.ts` | 按 `kind`（openai-compatible / deepseek / ollama / fake）创建 LangChain 模型 |
| `registry.ts` | 解析 `MODEL_CHAT=deepseek:deepseek-chat`；`getChatModel(alias)` 带缓存；`assertRegistry()` 启动校验 |
| `caps.ts` | 模型能力表 → 选择结构化输出方式 |
| `fake.ts` | 离线假模型，逐字输出 |
| `resilience.ts` | `getChatRunnable(alias)` 带 fallback；超时；错误归一为 `LLM_*` |
| `structured.ts` | `generateStructured(alias, zodSchema, messages)`：选方式 → 校验 → 修复重试 → fallback |
| `usage.ts` | `UsageCallbackHandler`：产出用量记录（写库函数由 core 注入） |

### 2.10 `src/agent/prompts/`

| 文件 | 做什么 |
|---|---|
| `dev-echo.ts` | 回声图的 system prompt 与 `ECHO_PROMPT_VERSION`（写入 `llm_calls.prompt_version`） |

---

### 2.11 `src/shared/`：公共底座

| 文件 | 做什么 |
|---|---|
| `domain/dev/echo-route.ts` | `routeAfterEchoReply({round,maxRounds})` → `'ask' \| 'finish'`（图条件边的判断） |
| `env/load.ts` | 读取 `.env` 到 `process.env` |
| `env/server.ts` | Zod 解析全部后端配置，非法即退出；`serverEnv()` |
| `env/client.ts` | 前端只能读 `VITE_*` |
| `common/ctx.ts` | `RequestCtx {userId, requestId}`：身份在各层间传递的唯一方式 |
| `common/errors.ts` | 错误码、HTTP 状态、文案、`AppError`（前后端共用，不能引 Node API） |
| `common/ids.ts` | `newId()`、`hashUserId()`（日志不出现明文 userId） |
| `common/logger.ts` | pino 根 logger（不记正文与 PII） |

未来 `shared/domain/` 会有 `interview/route.ts`、`interview/allocate.ts`、`resume/fact-ref-guard.ts`、`diagnosis/aggregate.ts`、`weakness/merge.ts`、`matching/skill-gap.ts`；`shared/schemas/` 会有各领域的 Zod 定义。

---

## 3. 它们怎么工作

### 3.1 开发态 / 生产态进程形态

```text
开发 (pnpm dev)                                  生产 (pnpm build && pnpm start)

 浏览器 :5173                                     浏览器 :3000 / :7860
    |                                                |
    v                                                v
 Vite dev server ── /api/* 代理 ──> Node :3000     Node (dist/server/entry.js)
 (src/frontend 热更新)             (tsx watch       ├─ /api/*  → Hono 路由
                                    src/backend/    └─ 其它    → dist/client 静态文件 + SPA fallback
                                    server/entry.ts)            |
                                       |                        |
                                       v                        v
                                    PostgreSQL  <───────────────┘
                                    public.*（业务表） langgraph.*（存档） pgboss.*（队列）
```

### 3.2 启动与停机顺序

```text
backend/server/entry.ts
  1. shared/env/load + serverEnv()    Zod 校验环境变量，非法即退出
  2. backend/core/runtime.startRuntime()
       agent/llm/registry.assertRegistry()      模型别名完整、provider 在白名单内
       backend/db/migrate.runMigrations()       (MIGRATE_ON_START 时)
       backend/db/repos/users.ensureUser()      单用户模式
       agent/graphs/checkpointer.setup...()     建 langgraph.* 表
       PgBoss.start() + backend/jobs.registerJobs()
  3. backend/server/app.createApp()   (+ 生产环境 serveStatic)
  4. serve() 监听

SIGTERM/SIGINT
  server.close()（最多 15s）→ boss.stop(graceful) → closePool() → exit
```

### 3.3 一个普通请求经过哪些文件（`GET /api/llm/ping`）

```text
frontend/routes/home.tsx                点击 Ping
  -> frontend/features/system/queries.ts      usePing()
  -> frontend/lib/api.ts                      api.llm.ping.$get({query:{alias}})  类型来自 AppType
        ──────────────── HTTP ────────────────
  -> backend/server/middleware/request-id.ts  生成 requestId
  -> backend/server/middleware/access-gate.ts 校验口令 Cookie
  -> backend/server/middleware/dev-user.ts    c.set('userId', DEV_USER_ID)
  -> backend/server/routes/llm.ts             validate(query) -> toCtx(c)
  -> backend/core/llm.service.ts              pingModel(ctx, alias)
  -> agent/llm/registry.ts                    getChatModel(alias) -> agent/llm/providers.ts
  -> (provider 远程调用 / fake)
     callbacks: backend/core/usage.ts -> agent/llm/usage.ts -> backend/db/repos/llm-calls.ts 写 llm_calls
  <- 出错: backend/server/middleware/error.ts {code,message,requestId}
  <- frontend/lib/api.ts unwrap()             抛 ApiClientError 或返回数据
```

---

## 4. 前端 / 后端 / 智能体交互图

### 4.1 组件关系（静态视图）

```text
+============================+      +==================================+      +===================================+
|      前端 src/frontend      |      |        后端 src/backend           |      |        智能体 src/agent            |
|                            |      |                                  |      |                                   |
|  routes/dev-echo.tsx       |      |  server/routes/dev.ts            |      |  graphs/echo/graph.ts             |
|    useChat ────────────────┼─SSE─>│    POST /echo/:id/chat           |      |    ask ─> wait_answer ─> reply    |
|    (lib/chat-transport)    |      |         │                        |      |     ^     (interrupt)       │     |
|                            |      |         v                        |      |     └── shared/domain 判断 ──┘     |
|  features/dev-echo/        |      |  core/dev.service.ts             |      |                │                  |
|    useEchoThread ──────────┼─RPC─>│    streamEchoTurn ───────────────┼─────>│  graph.stream(...)               |
|    (lib/api.ts hc)         |      |    getEchoThread  ───────────────┼─────>│  graph.getState(...)             |
|                            |      |         │                        |      |                │                  |
|  features/system/          |      |  core/llm.service.ts ────────────┼─────>│  llm/registry ─> llm/providers   |
|    useHealth/usePing ──────┼─RPC─>│  core/health.service.ts          |      |  llm/resilience (fallback)        |
|                            |      |  core/usage.ts ───注入 sink──────┼─────>│  llm/usage (回调)                 |
|                            |<─────┤  ← graphs/stream.ts 转换后返回    |<─────┤  prompts/dev-echo.ts              |
|                            | 流式 |                                  | 图流 |                                   |
+============================+      +=================┬================+      +=================┬=================+
                                                      │                                         │
                                                      v                                         v
                                    +--------------------------------------------------------------------+
                                    |  PostgreSQL   public.users / llm_calls    langgraph.* 存档          |
                                    |               pgboss.* 队列                                         |
                                    +--------------------------------------------------------------------+
```

`agent/graphs/stream.ts` 是两块之间的**翻译器**：把智能体的输出翻译成前端 `useChat` 能消费的协议。

### 4.2 一轮对话时序（回声图；以后的面试图完全同构）

```text
 前端 frontend                     后端 backend                          智能体 agent                      DB
 ─────────────                     ────────────                          ────────────                      ──
 ① 打开 /dev/echo
   useEchoThread ──GET /api/dev/echo/:tid──>
                                   core.getEchoThread
                                     ───getState(thread_id)────────────>  checkpointer ───读存档──────>  langgraph.*
                                   <──{messages, next, round}───────────
   <──JSON：历史消息、进度────────
   用历史初始化 useChat

 ② 用户输入回答并发送
   useChat.sendMessage
   transport 只取本轮 answer
   ──POST /api/dev/echo/:tid/chat {answer}──>
                                   middleware: requestId / accessGate / devUser
                                   routes/dev.ts: zod 校验
                                   core.streamEchoTurn(ctx, ...)
                                     getState → 判断 next:
                                       无存档       → stream({})
                                       wait_answer → stream(Command{resume:answer})
                                       其它节点     → stream(null) 续跑
                                     ───graph.stream(input, {thread_id,userId,requestId},
                                                     callbacks:[usage])──>
                                                                         wait_answer: interrupt 返回 answer
                                                                         reply: llm.getChatRunnable('chat')
                                                                                 ──> provider（逐 token）
                                                                         usage 回调 ───────────────────>  llm_calls
                                                                         shared/domain.routeAfterEchoReply
                                                                           → ask 或 finish
                                                                         ask: 再次调模型（逐 token）
                                                                         wait_answer: interrupt() 暂停
                                                                         每步写存档 ───────────────────>  langgraph.*
                                   <──LangGraph 流 (messages/custom/values)─
                                   agent/graphs/stream.ts graphToUIStream:
                                     start → data-run → text-delta... →
                                     data-echo-state → data-metrics → finish
   <══SSE (UI Message Stream)═════
   逐字渲染、更新进度
   出错 → parseStreamError → 按 code 显示文案

 ③ 刷新页面 / 重启后端进程 → 回到 ①，从存档恢复，可继续答题
```

### 4.3 回声图 vs 未来面试图

```text
   echo 图（现在）                          interview 图（P2a）
   ────────────────                         ─────────────────────────
        START                                     START
          v                                         v
   +-------------+                          +----------------+
   |    ask      |<-----+                   | plan_questions | 检索出题
   +------+------+      |                   +-------+--------+
          v             |                           v
   +-------------+      |                   +----------------+
   | wait_answer |      |                   |      ask       |<----+
   | interrupt() |      |                   +-------+--------+     |
   +------+------+      |                           v              |
          v             |                   +----------------+     |
   +-------------+      |                   |  wait_answer   |     |
   |   reply     |      |                   +-------+--------+     |
   +------+------+      |                           v              |
          | routeAfterEchoReply              +----------------+     |
     ask  |  finish                          |   evaluate     |     |
     -----+----+                             +-------+--------+     |
               v                                     | routeAfterEvaluate
         +----------+                     follow_up/next     finish |
         |  finish  |                     ---------------+----+-----+
         +----+-----+                                    v
              v                                   +------------+
             END                                  |  finalize  | -> 入队 diagnose
                                                  +-----+------+
                                                        v
                                                       END
```

### 4.4 以后加业务时三块怎么扩展

```text
 前端 frontend/                 后端 backend/                              智能体 agent/ (+ shared/domain)
 ─────────────────              ───────────────────────────                ────────────────────────────────
 routes/profile.tsx     ──>     server/routes/profile.ts                ──> graphs/extract   (简历 → 档案)
                                  → core/profile.service
 routes/jobs.tsx        ──>     server/routes/jobs.ts                   ──> graphs/extract   (JD → 要求)
                                  → core/job.service                        + shared/domain/matching/skill-gap
 routes/resumes.tsx     ──>     server/routes/resumes.ts                ──> graphs/resume
   useObject 流式                 → core/resume.service                     + retrieval/fact-retriever
                                                                            + shared/domain/resume/fact-ref-guard
 routes/interviews.tsx  ──>     server/routes/interviews.ts             ──> graphs/interview (照 echo 扩展)
   useChat 流式                   → core/interview.service                  + retrieval/question-retriever
                                    （加锁、幂等、先写回答再调图）          + shared/domain/interview/route|allocate
                                    finalize → jobs/diagnose 入队                   │
 routes/reports.tsx     ──>     server/routes/reports.ts                ──> graphs/diagnosis (Send 并行)
   轮询状态                       ← jobs/diagnose → core/diagnosis.service   + rubrics/v1 + shared/domain/aggregate

 共同依赖：shared/schemas（Zod）  backend/db（业务表）  agent/llm（模型）  shared/common（错误 / 日志 / ctx）
```

---

## 5. 推荐阅读顺序（约 30 分钟）

1. `src/backend/server/app.ts`：中间件与路由全貌。
2. `src/backend/server/routes/dev.ts` → `src/backend/core/dev.service.ts`：唯一完整的业务链路。
3. `src/agent/graphs/echo/graph.ts` + `src/shared/domain/dev/echo-route.ts`：LangGraph 核心写法。
4. `src/agent/graphs/stream.ts`：图输出怎么变成前端能用的流。
5. `src/frontend/routes/dev-echo.tsx` + `src/frontend/lib/chat-transport.ts`：前端怎么接流。
6. `src/backend/core/runtime.ts`、`src/agent/llm/registry.ts`：启动与模型切换。
7. [02 §6.4](02-architecture.md)：未来面试图的完整设计，对照 echo 阅读。

本地启动后访问 `/api/dev/graphs/echo/mermaid` 可以拿到图结构的 Mermaid 文本。

## 6. 文件头注释约定

每个源码文件顶部都有 `@file` 注释：

```ts
/**
 * @file 【所属块·层】一句话标题
 * 做什么：...
 * 怎么工作 / 被谁用 / 约定：...
 */
```

新建文件时请按同样格式补齐；新建目录时请补一份 `README.md`（说明本目录职责、放什么、不放什么）。
