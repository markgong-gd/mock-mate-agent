# 02 · 技术选型与技术架构

> 需求见 [01 · 产品需求](01-requirements.md)，排期见 [03 · 落地计划](03-delivery-plan.md)。
> 本文是 MockMate 的**技术基准**：技术选型、系统架构、工程结构、Agent 运行时、模型层、检索、数据层、部署与工程约束。
> **新增 / 替换技术选型、调整架构边界，需先更新本文档。**

## 0. 项目背景与设计原则

**项目性质**：个人项目，1 人开发，带学习性质。优先级依次为：

1. **本地可运行**：一条命令起数据库，一条命令起应用。
2. **可部署到免费平台个人使用**：国内平台优先。
3. **对外开放**：后续可选，届时补齐鉴权与合规（见 §9.5、03 待补项）。

| # | 原则 | 落地方式 |
|---|---|---|
| 1 | 本地优先 | `docker compose up -d db` + `pnpm dev`；不依赖任何云服务即可开发（模型可用本地 Ollama） |
| 2 | 单仓、单进程 | 一个 package、一个 Node 进程同时承载 API、静态资源与异步任务；部署只有一个镜像 |
| 3 | 学习导向 | Agent 编排使用 **LangGraph.js**，显式使用 State / Node / Edge / Checkpointer / Interrupt / Send 等核心概念 |
| 4 | 模型可替换 | 业务只认模型别名；provider 与模型由环境变量决定（§5） |
| 5 | Schema 先行 | 领域对象、LLM 结构化输出、API 入参全部用 Zod 定义并校验，禁止裸解析字符串 |
| 6 | 业务真相在业务表 | 档案、简历、面试轮次、诊断、短板存业务表；LangGraph 存档只是运行时状态 |
| 7 | 决策逻辑纯函数化 | 路由判断、事实校验、得分聚合、短板合并都是纯函数，可脱离 LLM 与图单测 |
| 8 | 平台相关代码收口 | 平台差异只出现在 `backend/server/entry.ts`、`env`、`Dockerfile`、`deploy/` 中 |
| 9 | 安全与合规内建 | 密钥只在后端、所有数据按 `userId` 隔离、PII 脱敏、一键删除、不做实时代答 |

---

## 1. 技术选型

### 1.1 已确定

| 类别 | 选型 | 用途 |
|---|---|---|
| 语言 / 运行时 | TypeScript（strict）、Node.js LTS | 全栈统一 |
| 包管理 | pnpm（单 package） | 依赖管理与脚本 |
| 前端构建 | Vite | 开发服务器（代理 `/api` 到后端）与静态产物构建 |
| 前端框架 | React + React Router | SPA；业务全部需要登录态，不需要 SSR / SEO |
| UI | Tailwind CSS + shadcn/ui | 组件体系 |
| 前端数据 | TanStack Query | 请求、缓存、重试 |
| 流式 UI | AI SDK UI（`@ai-sdk/react` 的 `useChat` / `useObject`） | 面试对话与简历生成的流式渲染 |
| 后端框架 | Hono（`@hono/node-server`）+ `@hono/zod-validator` | HTTP 服务、静态资源托管、SSE |
| 前后端类型 | Hono RPC（`hc<AppType>`） | 前端只 import 后端的类型，不需要 OpenAPI 生成链路 |
| Agent 编排 | **LangGraph.js**（`@langchain/langgraph`） | 面试 / 诊断 / 简历 / 抽取四张图（§6），选型理由见 §1.2 |
| 运行时存档 | `@langchain/langgraph-checkpoint-postgres`（`PostgresSaver`） | 图状态持久化，`thread_id = sessionId`，支持中断恢复 |
| 模型调用 | LangChain 模型类（`@langchain/openai`、`@langchain/deepseek`、`@langchain/ollama` 等）+ 自研模型注册表 | provider 可替换（§5） |
| 流式适配 | `@ai-sdk/langchain` + `createUIMessageStream` | LangGraph 流 → AI SDK UI Message Stream（P0 验证，见 §1.3） |
| Schema | Zod | 唯一定义源 |
| 数据库 | PostgreSQL + pgvector | 业务数据、向量检索、LangGraph 存档、任务队列共用一个库 |
| ORM | Drizzle（+ drizzle-kit） | 类型安全的数据访问与迁移 |
| 向量检索 | pgvector（HNSW + cosine）+ 结构化过滤，可选 `pg_trgm` 关键词召回与重排 | 题库与职业事实检索（§7） |
| 任务队列 | pg-boss（在应用进程内消费） | 诊断、向量化、备份等异步任务；不需要额外服务 |
| 简历解析 | 浏览器端 `unpdf`（基于 pdf.js）提取文本 + 后端抽取图 | 原文件不出浏览器（N-2） |
| 简历导出 | HTML 模板 + 打印样式（浏览器“打印为 PDF”） | 中文排版无字体问题，服务端零开销 |
| 日志 | pino | 结构化日志，不含正文与明文 PII |
| 用量与成本 | LangChain 回调 → `llm_calls` 表 | Token、耗时、模型、会话维度的成本统计（N-12） |
| 评测 | promptfoo（自定义 provider 调用图）+ Vitest | 幻觉、出题相关性、评分一致性、偏见；可横向对比不同 provider |
| 测试 | Vitest + Testing Library；集成测试用 `app.request()` + 真实 Postgres + 假模型 | 见 §9.6 |
| 代码规范 | ESLint（含 `import/no-restricted-paths` 分层约束）+ Prettier | 见 §2.3 |
| 本地环境 | docker compose（`pgvector/pgvector` 镜像） | 本地数据库；可选启用 app 与 Langfuse |
| 部署 | 单镜像（Node + 内置 Postgres） | 首选魔搭 Docker 创空间（§10） |

### 1.2 Agent 框架：LangGraph.js（对比 Mastra）

| 维度 | LangGraph.js | Mastra |
|---|---|---|
| 与面试流程的契合度 | **高**：面试是“提问 → 等回答 → 评估 → 追问或下一题”的循环，对应“有环的图 + `interrupt()` + 按会话存档” | 中：Workflow 偏流水线（`.then` / `.branch` / `.dountil`），也支持暂停恢复，但带条件回跳的循环不如图直观 |
| 学习价值 | **高**：State / Reducer / Node / Edge / Checkpointer / Interrupt / Command / Send / Subgraph / Store 是跨语言的主流编排模型 | 中：封装层次高、上手快，机制被隐藏较多，仅 TS 生态 |
| provider 替换 | 节点内调用任意模型；LangChain 模型类可接所有 OpenAI 兼容接口 | 基于 AI SDK，同样方便 |
| 开箱能力 | 少：Studio 需要 LangSmith 账号（海外），评测与观测需自建 | 多：本地 Playground、Evals、RAG、Memory 自带 |
| 前端流式对接 | 需要一层适配（`@ai-sdk/langchain` 或自写 SSE） | 与 AI SDK UI 天然打通 |

**结论**：选 LangGraph.js。项目的核心难点是“可中断、可恢复、会追问的面试循环”，正是 LangGraph 的典型场景，概念也最值得学习。
**代价**：流式适配、评测、观测、调试可视化需要自己补（§6.7、§9.2）。

**使用约定**：

| # | 约定 | 原因 |
|---|---|---|
| 1 | 节点内调模型统一走 `agent/llm/registry`，使用 LangChain 模型类，不混用 AI SDK Core | 保证 `streamMode: "messages"`、工具调用、回调追踪原生可用 |
| 2 | 条件边的判断逻辑写在 `shared/domain/` 纯函数中，图只负责调用 | 不跑图、不调模型也能单测边界 |
| 3 | `interrupt()` 单独放在一个无副作用的节点里 | 恢复时该节点会从头重新执行 |
| 4 | `userId`、`requestId` 通过 `config.configurable` 注入，工具不把它们当参数 | 防止 Prompt 注入越权 |
| 5 | LLM 可调用的工具只读；写库只发生在确定性节点或 `core` 中 | 写操作可审计、可测试 |
| 6 | 业务表是真相源，存档是运行时状态；删除用户时同时删除存档线程 | 一键删除与诊断不依赖存档格式 |

### 1.3 待定项（按阶段决策）

| 事项 | 候选 | 决策时机 | 替换边界（只改这里） | 默认 / MVP |
|---|---|---|---|---|
| 流式适配方式 | `@ai-sdk/langchain` / 自写 SSE + 自写 hook | P0（P0-04） | `agent/graphs/stream.ts`、`frontend/lib/chat-transport.ts` | **已定：`@ai-sdk/langchain`**（2026-10-23）。`toUIMessageStream` 消费 `streamMode: ["values","messages","custom"]`；`agent/graphs/stream.ts` 关闭其自带 start/finish，自行补 `start` → prelude data part → 图输出 → `data-metrics` → `finish`，流内错误替换为 `{code,message}` JSON；前端 `DefaultChatTransport` 只回传本轮 `answer`。实测 fake 模型逐字输出、首字 ≈ 30~70 ms，无缓冲 |
| 部署平台 | 魔搭 Docker 创空间 / 自有机器 + 内网穿透 / 轻量服务器 | P0（P0-06） | `Dockerfile`、`deploy/`、`env` | **暂定：魔搭**（2026-10-23）。镜像本地实测通过（见 §10.3）；平台侧实测待上线后补记 |
| 主力模型 | 按 §5 注册表切换；免费（智谱 Flash、硅基流动小模型）/ 付费（DeepSeek、百炼等）/ 本地 Ollama | 持续评估，P5 用评测结果定 | `.env` 的 `PROVIDER_*` / `MODEL_*` | 按评测结果 |
| 向量化模型与维度 | 百炼 text-embedding / 硅基流动 bge-m3 / Ollama bge-m3 | P1（P1-08） | `MODEL_EMBED`、`EMBEDDING_DIM` + 重新向量化（§5.4） | **已定：列固定 `vector(1024)`**（2026-10-24）。与 bge-m3 族对齐，低于 pgvector HNSW 的 2000 维上限。`EMBEDDING_DIM` 不是 1024 时启动失败（换维度要新迁移）。未接真实向量模型时用进程内 n-gram 哈希，模型 id 为 `fake:ngram-1024`（`.env` 写 `MODEL_EMBED=fake:hash` 也走这条）。真实模型示例：`ollama:bge-m3`、`siliconflow:BAAI/bge-m3`；deepseek kind 没有 embeddings。`embed_model` 与当前模型不同的行会重新向量化。检索 SQL 必须带 `user_id`，距离用 `<=>`，相似度 `1 - distance`，索引 `vector_cosine_ops` |
| 重排 | 不重排 / bge-reranker（`MODEL_RERANK`） | P2a（P2a-04），按检索评测结果 | `agent/retrieval/rerank.ts`、`QUESTION_RETRIEVAL` | **已定：不重排；启用 pg_trgm 关键词召回 + RRF**（2026-10-25）。`keyword: true`，`rerank: false`，`rrfK: 60`。关键词路用 `%`，中文短词再按技能标签 ILIKE 纳入候选，然后按 `similarity` 排序。`evals/retrieval/questions.json` 上，n-gram 哈希向量的 mean recall@5 ≥ 0.8。以后要重排，只改 `rerank.ts` 并把常量里的 `rerank` 打开 |
| 长期记忆 | 仅业务表 / 业务表 + LangGraph `PostgresStore` | P3（P3-06） | `agent/graphs/memory/*` | **已定：仅业务表**（2026-10-25）。闭环需要的三件事都在业务表里能查：短板（`weaknesses` + `domain/weakness/merge` 去重）、技能趋势（`skill_score_history`）、复训计划（`diagnosis_reports.plan`）。再加一层 Store 会多出"同一结论两处存、删除要删两遍、口径可能不一致"的成本，而当下拿不到额外收益。重新评估的触发条件：需要存"跨岗位的自由文本洞察"（例如"这个人讲项目总是先讲结论"）且无法落成结构化字段时 |
| 语音方案 | 半双工：ASR + TTS（豆包 / 百炼）；实时：百炼 Qwen-Omni-Realtime / 豆包端到端实时语音 | P4（P4-01） | `agent/voice/*` + `MODEL_ASR` / `MODEL_TTS` / `MODEL_REALTIME` | 先半双工 |
| 正式鉴权 | Better Auth（Drizzle 适配器） | **待补项**，对外开放前（03 B-01） | `backend/server/middleware/dev-user.ts` → `auth.ts`；登录页与路由守卫 | 单用户 `devUser` + 部署时 `accessGate` |

> 每项决策完成后，在本表更新结论，并在文末变更记录中登记。

### 1.4 主版本登记

LangGraph.js、LangChain、AI SDK 迭代快，引入或升级前以官方最新文档为准，并在此登记主版本。

| 依赖 | 主版本 | 登记日期 |
|---|---|---|
| node | 22（`engines` ≥ 22，镜像 `node:22-bookworm-slim`） | 2026-10-23 |
| @langchain/langgraph / @langchain/langgraph-checkpoint-postgres | 1.x / 1.x（1.5 / 1.1） | 2026-10-23 |
| @langchain/core / @langchain/openai | 1.x / 1.x（1.2 / 1.6）；另 @langchain/deepseek 1.x、@langchain/ollama 1.x | 2026-10-23 |
| ai / @ai-sdk/react / @ai-sdk/langchain | 7.x / 4.x / 3.x | 2026-10-23 |
| hono | 4.x | 2026-10-23 |
| drizzle-orm / drizzle-kit | 0.45 / 0.31 | 2026-10-23 |
| pg-boss | 12.x | 2026-10-23 |
| postgres / pgvector | 17 / 0.8 | 2026-10-23 |
| zod | 4.x | 2026-10-23 |
| 其它 | react 19、react-router 8、vite 8、vitest 5、tailwindcss 4、typescript 6、eslint 10、unpdf 1.x（浏览器端抽 PDF 文本） | 2026-10-23 / unpdf 2026-10-24 |

### 1.5 构建与运行

| 场景 | 方式 |
|---|---|
| 开发 | `pnpm dev` 并行启动 Vite（前端，代理 `/api` 到后端）与 `tsx watch src/backend/server/entry.ts`（后端） |
| 构建 | `vite build` → `dist/client`；`tsup` 打包后端 → `dist/server` |
| 生产 | `node dist/server/entry.js`：Hono 同时托管 `dist/client` 静态资源与 `/api/*`，同源无 CORS |

---

## 2. 系统架构

### 2.1 运行形态

```text
浏览器 (SPA)
  | HTTP / SSE (Cookie)
  v
+---------------------------------------------------------------+
| Node 进程 (Hono)                                               |
|  middleware: requestId -> accessGate(部署时) -> devUser -> error |
|  静态资源: dist/client                                          |
|  routes /api/* ──> core services                               |
|                      |                                         |
|                      +──> graphs (LangGraph)                    |
|                      |      interview / diagnosis / resume /    |
|                      |      extract                             |
|                      |        | nodes ──> llm registry ──> 任意 provider
|                      |        | tools ──> repos / retrievers    |
|                      |        v                                 |
|                      |      PostgresSaver (thread = sessionId)  |
|                      +──> pg-boss: diagnose / embed-* / backup   |
+-------------------------------+-------------------------------+
                                v
         PostgreSQL + pgvector
         public.*  业务表 + 向量    langgraph.*  存档    pgboss.*  队列
```

### 2.2 分层与职责

`src/` 按 **前端 / 后端 / 智能体 / 公共底座** 四块物理分目录，每块内部再分层（逐文件说明见 [04 · 代码地图](04-code-map.md)）：

```text
src/frontend ── 只 import type AppType ──> src/backend/server
   页面 / 组件 / hooks / hc 客户端

------------------------------- backend（后端）-------------------------------
src/backend/server   Hono：中间件 + 路由；路由只做“解析 -> 调 core -> 映射”
   |
   v
src/backend/core     用例：权限、事务、幂等、加锁、调图、入队、写库
   |
   +--> src/backend/jobs   pg-boss 注册与 handler（handler 只调 core）
   +--> src/backend/db     Drizzle schema / repos（强制传 userId）/ client / 向量查询
   |
------------------------------- agent（智能体）------------------------------
   +--> src/agent/graphs     LangGraph 图：interview / diagnosis / resume / extract
   |       +--> src/agent/tools       只读工具（userId 从 config 取）
   |       +--> src/agent/retrieval   QuestionRetriever / FactRetriever
   |       +--> src/agent/prompts、src/agent/rubrics
   +--> src/agent/voice      VoiceProvider 端口与适配器（P4）
   +--> src/agent/llm        模型注册表 / 能力表 / 结构化输出 / 韧性 / 脱敏 / 用量回调

------------------------------- shared（公共底座）----------------------------
src/shared/domain    纯函数：路由判断 / 出题分配 / factRefGuard / aggregate / merge / skillGap
src/shared/schemas   Zod 领域定义
src/shared/env       环境变量校验（server.ts 仅后端 / client.ts 仅前端）
src/shared/common    ctx / 错误码 / id / 日志 / PII 脱敏规则
```

| 块 | 层目录 | 职责 |
|---|---|---|
| 前端 | `frontend` | 页面、交互、流式渲染；只通过 HTTP 调后端 |
| 后端 | `backend/server` | 中间件、路由、静态资源、进程启动与优雅停机；不写业务逻辑 |
| 后端 | `backend/core` | 权限、事务、幂等、并发控制、调图、入队、持久化 |
| 后端 | `backend/jobs` | 异步任务（handler 只调 core） |
| 后端 | `backend/db` | 数据访问 |
| 智能体 | `agent/graphs` | 图的状态、节点、边；节点可调用 llm、retrieval、repos |
| 智能体 | `agent/tools` / `agent/retrieval` / `agent/prompts` / `agent/rubrics` | 工具、检索器、带版本的 Prompt、Rubric 定义 |
| 智能体 | `agent/llm` / `agent/voice` | 模型网关、语音适配 |
| 公共 | `shared/domain` | 纯业务规则，零 IO、零三方 SDK |
| 公共 | `shared/schemas` / `shared/env` / `shared/common` | 定义、配置、公共工具 |

> 智能体代码运行在后端进程内（不是独立服务），由 `backend/core` 调用；节点可以读 `backend/db`（取数据），存档与业务表共用连接池。

### 2.3 依赖规则

只允许向下依赖，由 ESLint `import/no-restricted-paths` 强制（`eslint.config.js` 的 `LAYER_DEPS`）：

```text
frontend          ----> shared/schemas, shared/common(仅 errors.ts), shared/env(仅 client.ts),
                        backend/server(仅 import type AppType)
backend/server    ----> backend/core, shared/{schemas,common,env}
backend/core      ----> agent/{graphs,llm,retrieval,voice}, backend/{jobs,db}, shared/*
backend/jobs      ----> backend/core（handler 只调 core）
agent/graphs      ----> agent/{tools,retrieval,prompts,rubrics,llm}, backend/db, shared/{domain,schemas,common}
agent/tools, agent/retrieval -> agent/llm, backend/db, shared/{domain,schemas,common}
agent/llm, backend/db ----> shared/{schemas,common,env}
shared/domain     ----> shared/schemas            零 IO、零三方 SDK
shared/schemas    ----> zod
```

- `backend/core` 及以下（含 `agent/*`、`shared/*`）不得依赖 `hono`、`react`；身份只通过 `ctx` 传入，不读 Cookie / Header。
- `frontend` 不得引入 Node 专属 API 与服务端 SDK；对后端只允许 `import type`。
- 密钥只在 `shared/env/server` 中读取，`frontend` 只能读 `VITE_*` 非敏感变量。

---

## 3. 工程结构

> 已有文件的逐一说明、请求链路与前端 / 后端 / 智能体交互图见 [04 · 代码地图](04-code-map.md)；每个目录下也有 `README.md`。

```text
mock-mate-agent/
├── src/
│   ├── frontend/                       # 【前端】Vite SPA
│   │   ├── main.tsx  router.tsx  nav.ts
│   │   ├── routes/                     # profile / jobs / resumes / interviews / reports / growth / settings
│   │   ├── features/<domain>/{components,hooks,queries}.ts
│   │   ├── components/ui/              # shadcn/ui
│   │   └── lib/{api.ts, chat-transport.ts, pdf-text.ts}   # hc 客户端 / 流式端点 / 浏览器端 PDF 提取
│   │
│   ├── backend/                        # 【后端】
│   │   ├── server/
│   │   │   ├── app.ts                  # Hono 实例、中间件装配、导出 AppType
│   │   │   ├── entry.ts                # 启动：迁移锁、pg-boss、checkpointer.setup()、静态资源、优雅停机
│   │   │   ├── middleware/{request-id,access-gate,dev-user,rate-limit,error}.ts
│   │   │   └── routes/{health,llm,profile,jobs,resumes,interviews,reports,training,growth,usage,privacy,voice,dev}.ts
│   │   ├── core/                       # {profile,job,resume,interview,diagnosis,training,privacy,usage}.service.ts
│   │   ├── jobs/{index.ts, diagnose.ts, embed-questions.ts, embed-facts.ts, backup.ts}
│   │   └── db/
│   │       ├── schema/*.ts             # 按领域拆分的表定义
│   │       ├── repos/*.ts              # 所有方法强制传 userId
│   │       ├── vector.ts               # 向量 / 混合检索 SQL
│   │       └── client.ts               # node-postgres 连接池（Drizzle、PostgresSaver、pg-boss 共用连接串）
│   │
│   ├── agent/                          # 【智能体】运行在后端进程内
│   │   ├── graphs/
│   │   │   ├── checkpointer.ts         # PostgresSaver 单例
│   │   │   ├── config.ts               # configurable 注入约定
│   │   │   ├── stream.ts               # LangGraph 流 -> UI Message Stream
│   │   │   ├── echo/                   # P0 回声图（样板）
│   │   │   ├── interview/{state.ts, graph.ts, nodes/*.ts}
│   │   │   ├── diagnosis/{state.ts, graph.ts, nodes/*.ts}
│   │   │   ├── resume/{state.ts, graph.ts, nodes/*.ts}
│   │   │   ├── extract/{profile.ts, job.ts}
│   │   │   └── memory/                 # 评估后决定不启用（§1.3 P3-06），目录不建
│   │   ├── llm/{providers,registry,caps,fake,structured,resilience,redact,pricing,usage}.ts
│   │   ├── prompts/*.ts                # 带版本号的 Prompt
│   │   ├── tools/weaknesses.ts         # 只读工具：历史短板（userId 从 config 取）
│   │   ├── retrieval/{question-retriever.ts, fact-retriever.ts, rerank.ts}
│   │   ├── rubrics/v1.ts
│   │   └── voice/                      # P4
│   │
│   └── shared/                         # 【公共底座】
│       ├── domain/
│       │   ├── interview/{route.ts, allocate.ts}   # 评估后路由 / 出题分配
│       │   ├── resume/fact-ref-guard.ts
│       │   ├── diagnosis/aggregate.ts
│       │   ├── weakness/merge.ts
│       │   └── matching/skill-gap.ts
│       ├── schemas/                    # common / profile / job / resume / interview / rubric / diagnosis / weakness / question / growth / usage
│       ├── env/{load.ts, server.ts, client.ts}
│       └── common/{ctx.ts, errors.ts, ids.ts, logger.ts, pii.ts}
├── db/
│   ├── migrations/                     # drizzle-kit 生成；0000 启用 vector、pg_trgm
│   └── seeds/{questions,rubrics}/      # 题库（JSONL）、Rubric
├── tests/{helpers,integration}/        # 集成测试；单元测试与源码同目录（*.test.ts）
├── evals/                              # promptfoo 配置与数据集：resume / interviewer / diagnosis / retrieval / bias
├── deploy/
│   └── modelscope/entrypoint.sh        # 初始化并启动内置 Postgres，再启动应用
├── docker-compose.yml                  # db（默认）；app、langfuse（profile 可选）
├── Dockerfile                          # 生产单镜像
├── vite.config.ts  tsup.config.ts  drizzle.config.ts  eslint.config.js  vitest.config.ts
├── .env.example
└── package.json
```

---

## 4. 前后端交互

### 4.1 接口与类型

- 后端 `backend/server/app.ts` 用链式写法注册路由并导出 `type AppType`；前端 `lib/api.ts` 用 `hc<AppType>('/')` 获得类型安全客户端。
- 入参统一由 `@hono/zod-validator` 校验，Schema 来自 `shared/schemas/`。
- 路径前缀 `/api`；只有一个客户端，不做版本号。

| 领域 | 路由 |
|---|---|
| 健康 | `GET /api/healthz`（存活）、`GET /api/readyz`（含 DB） |
| 模型 | `GET /api/llm/ping?alias=chat`（连通检查） |
| 档案 | `POST /api/profile/extract`（简历文本 → 草稿，不落库）、`GET / PUT /api/profile` |
| JD | `POST /api/jobs`、`GET /api/jobs/:id`（含匹配与缺口） |
| 简历 | `POST /api/resumes/generate`（流式；`jobId` 可省略，省略时生成主简历）、`GET / PUT /api/resumes/:id`、`GET /api/resumes/:id/export` |
| 面试 | `POST /api/interviews`（流式，返回首题）、`GET /api/interviews/:id`、`POST /api/interviews/:id/chat`（流式）、`POST /api/interviews/:id/finish` |
| 诊断 | `GET /api/reports`（可带 `?sessionId=`）、`GET /api/reports/:id`、`POST /api/reports/:id/retry` |
| 训练 / 成长 | `POST /api/training`（专项训练，入参 `{ reportId, tag }`）、`GET /api/growth` |
| 用量 | `GET /api/usage/sessions/:id` |
| 隐私 | `DELETE /api/privacy/me` |
| 语音（P4） | `POST /api/voice/transcribe`、`POST /api/voice/tts`；实时模式 `GET /api/voice/realtime`（WebSocket） |
| 调试（仅开发） | `GET /api/dev/threads/:threadId/state`、`GET /api/dev/graphs/:name/mermaid`、`POST /api/dev/faults`（故障注入） |

### 4.2 流式协议

| 场景 | 后端 | 前端 |
|---|---|---|
| 面试对话 | `graph.stream(..., { streamMode: ["messages", "custom", "updates"] })` → `@ai-sdk/langchain` 转换 → `createUIMessageStream` 合并自定义 data part → SSE | `useChat`（自定义 transport 指向 `/api/interviews/:id/chat`） |
| 简历生成 | 模型输出的 JSON 文本（json_mode）或 tool call 参数分片，原样作为文本流下发 | `useObject` 增量解析预览 |

- 自定义 data part：`data-interview-state`（题号、追问次数、阶段）、`data-usage`（本轮 Token）。
- 流式响应头：`Cache-Control: no-cache`、`X-Accel-Buffering: no`；P0 在本地与魔搭上分别验证不被缓冲。
- 流式阶段只用于预览；落库前后端做全量 Zod 校验。

### 4.3 错误契约

统一 `{ code, message, requestId, details? }`，`code` 为 `shared/common/errors.ts` 中的枚举（§9.3），前端按 `code` 决定文案与是否重试。流式过程中的错误以 UI Message Stream 的 error part 下发，`message` 只包含错误码对应的文案。

### 4.4 同源与会话

- 开发：Vite 代理 `/api` 到后端；生产：Hono 同时托管静态资源与 API。始终同源，不开 CORS。
- 当前无正式鉴权：`devUser` 中间件注入固定用户（`DEV_USER_ID`）。部署到公网时启用 `accessGate`（§9.5）。
- 只使用 httpOnly Cookie，不使用 `Authorization` 头（魔搭平台禁止该头）。

---

## 5. 模型层（provider 可替换）

### 5.1 注册表

业务代码只使用别名，provider 与模型由环境变量决定：

| 别名 | 用途 |
|---|---|
| `chat` | 面试播报、简历生成等面向用户的生成 |
| `judge` | 回答评估、诊断打分 |
| `extract` | 简历 / JD 结构化抽取 |
| `fallback` | 以上调用失败时的备选 |
| `embed` | 向量化 |
| `rerank` | 重排（可选） |
| `asr` / `tts` / `realtime` | 语音（P4） |

```text
# .env 示例
PROVIDERS=deepseek,qwen,glm,ollama

PROVIDER_DEEPSEEK_KIND=deepseek
PROVIDER_DEEPSEEK_API_KEY=sk-...

PROVIDER_QWEN_KIND=openai-compatible
PROVIDER_QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
PROVIDER_QWEN_API_KEY=sk-...

PROVIDER_GLM_KIND=openai-compatible
PROVIDER_GLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
PROVIDER_GLM_API_KEY=...

PROVIDER_OLLAMA_KIND=ollama
PROVIDER_OLLAMA_BASE_URL=http://localhost:11434

MODEL_CHAT=deepseek:deepseek-chat
MODEL_JUDGE=qwen:qwen-turbo
MODEL_EXTRACT=glm:glm-4.7-flash
MODEL_FALLBACK=qwen:qwen-plus
MODEL_EMBED=qwen:text-embedding-v4
EMBEDDING_DIM=1024

ALLOWED_PROVIDERS=*            # 对外开放时改为国内已备案 provider 白名单
```

| 文件 | 职责 |
|---|---|
| `agent/llm/providers.ts` | `kind` → LangChain 模型类工厂：`openai-compatible`（`ChatOpenAI` + `baseURL`）、`deepseek`、`ollama`，可按需扩展 |
| `agent/llm/registry.ts` | 解析 `MODEL_*`，按别名返回模型实例（带缓存）；启动时校验别名完整、provider 在 `ALLOWED_PROVIDERS` 内 |
| `agent/llm/caps.ts` | 模型能力表（内置常见模型 + `MODEL_CAPS_*` 覆盖） |
| `agent/llm/structured.ts` | 结构化输出：按能力选择方式 → Zod 校验 → 修复重试 |
| `agent/llm/resilience.ts` | 超时、重试、降级 |
| `agent/llm/redact.ts` | 发送给模型前脱敏（规则在 `shared/common/pii.ts`，日志出口共用同一套） |
| `agent/llm/pricing.ts` | 按 `provider:model` 配单价（元 / 百万 token），成本现算不落库 |
| `agent/llm/usage.ts` | 回调处理器，写 `llm_calls` |

### 5.2 能力表与结构化输出降级

不同模型对结构化输出的支持差异很大，是“换模型”时最容易出问题的地方。

```text
generateStructured(alias, schema, messages, meta)
  |
  | caps = caps.ts[alias 对应模型]
  v
caps.jsonSchema ? withStructuredOutput(schema, { method: "jsonSchema" })
: caps.tools    ? withStructuredOutput(schema, { method: "functionCalling" })
: caps.jsonMode ? withStructuredOutput(schema, { method: "jsonMode" })  + Prompt 中给出 JSON 示例
:                 Prompt 约束 + 提取 JSON 文本
  |
  v
Zod 校验 --失败--> 携带校验错误修复重试 1 次 --仍失败--> 走 resilience 降级
```

| 能力字段 | 说明 |
|---|---|
| `jsonSchema` | 支持严格 JSON Schema 输出 |
| `tools` | 支持工具调用 |
| `jsonMode` | 支持 JSON mode |
| `reasoning` | 推理模型（输出含思考内容，需剥离；不用于低延迟的 `judge`） |
| `contextWindow` | 上下文长度，用于截断策略 |

### 5.3 韧性

```text
调用 --(AbortSignal 超时)--> 失败?
  | 429 / 5xx       -> 指数退避重试（最多 2 次）
  | 结构化校验失败   -> 携带校验错误修复重试 1 次
  | 仍失败           -> 切 MODEL_FALLBACK 再试 1 次（LangChain withFallbacks）
  | 仍失败           -> 抛 AppError (LLM_*)
```

### 5.4 更换向量化模型

换向量模型等于换向量空间，不能原地覆盖：

1. 新增迁移：给 `questions` / `facts` 增加新向量列（维度可能不同）及 HNSW 索引，或新建影子表。
2. 修改 `MODEL_EMBED` / `EMBEDDING_DIM` 后，启动 `embed-questions` / `embed-facts` 任务全量重新向量化（批量、可续跑）。
3. 完成后切换检索读取的列，删除旧列。
4. 每行记录 `embed_model`，检索时只匹配当前模型的向量。

### 5.5 合规开关

- 个人自用阶段：`ALLOWED_PROVIDERS=*`，允许接入个人付费模型（含境外模型）。**选用境外模型时，发送给模型的内容会出境**，由本人知情决定。
- 对外开放前：`ALLOWED_PROVIDERS` 设为国内已备案 provider 白名单，注册表启动时校验，满足 N-13 / N-14。

### 5.6 用量与成本

- `agent/llm/usage.ts` 实现 LangChain `BaseCallbackHandler`，在 `handleLLMEnd` 中写入 `llm_calls`：`user_id`、`session_id`、`function_id`、`alias`、`provider`、`model`、`prompt_version`、`input_tokens`、`output_tokens`、`latency_ms`、`status`。**不记录正文**。
- 挂载点在 `backend/core/*.service.ts`（`createUsageHandler`）。**诊断的调用也挂在面试的 `session_id` 上**，所以"单场成本"= 面试 + 这一场的诊断。
- 成本 = Token × 单价，单价在 `agent/llm/pricing.ts` 中按 `provider:model` 配置（`provider:*` 作为兜底）。
  - **单价不落库**：会调价，存下来就对不上账；读接口 `GET /api/usage/sessions/:id` 每次现算。
  - 单价没配时返回 `null`（页面显示"未配置单价"），不默认 0——0 会被误读成"不花钱"。
- 单场面试 Token 上限（`backend/core/config.ts` 的 `limits.sessionTokenBudget`）在 `POST /api/interviews/:id/chat` 调模型之前检查，超出返回 `BUDGET_EXCEEDED`。已落库的轮次和报告不受影响，用户可以结束本场并查看诊断。前端按错误码判断"能不能重试"：`BUDGET_EXCEEDED` 这类不可重试的错误不显示重试按钮，改为引导结束本场。
- 副作用提醒：用量回调会在模型调用的回调链里 `await` 一次写库。并行分支（诊断的 `Send` 打分）里如果有一个分支快速失败，其它还在途中的分支会被一起中止、写入丢失，重跑时会多打一两题——分数不会叠加（按唯一键 upsert），只是多花一点 Token。

---

## 6. Agent 运行时（LangGraph）

### 6.1 图清单

| 图 | 对应能力 | 是否用存档 | 主要学习点 | 对应需求 |
|---|---|---|---|---|
| `extract` | 简历文本 → 档案草稿；JD → 技能要求 | 否 | 结构化输出降级 | R-P1、R-C1-1 |
| `resume` | 档案 + JD → 定制简历；无 JD → 主简历 | 否 | 检索增强、结构化流式、校验节点、简历标准 | R-C1-3 ~ R-C1-5、R-C1-7、R-C1-8 |
| `interview` | 多轮面试，含追问 | 是，`thread_id = sessionId` | 有环的图、`interrupt` / `Command`、存档恢复 | R-C2-1 ~ R-C2-6、R-C2-10 |
| `diagnosis` | 逐题打分 → 诊断报告 → 短板 → 复训计划 | 是，`thread_id = diag:<reportId>` | `Send` 并行（map-reduce）、Reducer、可续跑 | R-C3-1 ~ R-C3-4、R-C3-6、R-P3 |

```text
                  +---------------------------------+
                  |  职业档案 (profiles/facts/skills) |<---- 上传简历 / 表单采集 / 用户确认
                  |  + weaknesses + score_history   |
                  +---+--------------+-----------+--+
                      |              |           ^
          档案 + JD   |   档案+JD+短板 |           | 短板写回 / 得分历史
                      v              v           |
               +-----------+   +------------+   +-----------+
               | resume 图  |   | interview 图|-->| diagnosis图|
               | C1        |   | C2         |   | C3        |
               +-----+-----+   +-----+------+   +-----+-----+
                     |               ^                |
           简历 + factRefs            |   复训计划/专项训练  |
                     v               +----------------+
                 打印导出

  ───────── 横切：retrieval（pgvector）/ llm 注册表 / llm_calls 用量 ─────────
```

### 6.2 后端请求链路

```text
client --HTTP--> server
                  | middleware: requestId -> accessGate -> devUser(注入 ctx.userId) -> rateLimit
                  | route: zod-validator 解析入参
                  v
                core.xxxService(ctx, input)          ctx = { userId, requestId }
                  | 权限 / 事务 / 幂等 / 加锁 / 调图或入队 / 写库
                  v
                graph.stream(input, { configurable: { thread_id, userId, requestId },
                                      callbacks: [usageHandler] })
                  | nodes -> llm registry -> provider
                  | tools / retrievers 从 config 取 userId -> repos
                  v
                AppError --> error 中间件 --> 统一错误契约
```

### 6.3 C1 简历定制

```text
[浏览器] 选择 PDF -> unpdf 提取文本（原文件不上传）
         -> 规则抽取联系方式（手机号 / 邮箱）留在前端草稿，不发给模型
         或：空白表单填写技术栈（熟练度、证据事实）和经历事实
POST /api/profile/extract   { text }                       （文本长度上限，如 50k 字符）
     -> llm/redact 脱敏 -> extract 图 -> ProfileDraft（不落库）
     抽取结果的技能熟练度默认为 used，证据事实为空。模型不输出这两项。
PUT  /api/profile           用户确认后写入 experiences / facts / skills
     -> expert 且没有证据事实、或证据 id 不在本次事实里：400
     -> 入队 embed-facts
POST /api/jobs              { jdText }
     -> extract 图 -> JobTarget + requirements -> domain.skillGap -> 返回匹配项 / 缺口
POST /api/resumes/generate  （流式）
     body: { jobId? }     有 jobId 为岗位定制，省略 jobId 为主简历
     -> resume 图:
        load(profile + job?)     主简历不读岗位
          -> retrieve_facts
               岗位定制：FactRetriever，每条 JD 要求召回相关事实
               主简历：该用户全部事实，按经历顺序，最多 24 条
          -> generate（chat 模型流式输出 ResumeDraft，Prompt resume@2）
          -> guard（domain.factRefGuard；无效引用标 unverified）
          -> standard（domain.resumeStandard，不调模型，不改正文）
          -> save（resumes 新版本 version + 1，写入 quality）
GET  /api/resumes/:id
     -> 按当前档案重算 quality 再返回（库里的 quality 是生成或编辑时的快照）
GET  /api/resumes/:id/export
     -> 含 unverified 条目返回 409；标准问题不参与这次判断
     -> 否则返回打印数据，前端打印页渲染后调用 window.print()
```

- `ResumeDraft` 每条 bullet 要求 `factRefs.min(1)`（Zod 层强制）。
- 联系方式不经过模型，导出时由模板从档案填充。
- 简历标准的规则见 01 · R-C1-8。`error` 与 `warning` 都只展示。
- 主简历 `resumes.kind = master` 且 `job_target_id` 为空。岗位定制 `kind = tailored`。版本号按「同一岗位」或「该用户的主简历」分别递增。
- 技能熟练度存在 `skills.level`（`used` / `proficient` / `expert`），证据存在 `skills.evidence_fact_ids`。标签目录仍是封闭的，匹配、题库、诊断继续只看 `tag`。

### 6.4 C2 面试图（核心）

**状态**（`agent/graphs/interview/state.ts`）：

| 字段 | 说明 | Reducer |
|---|---|---|
| `messages` | 本场对话的 LLM 工作记忆 | `messagesStateReducer`（追加） |
| `questionQueue` | 出题队列（开场一次性生成） | 覆盖 |
| `cursor` | 当前题目下标 | 覆盖 |
| `followUpCount` / `maxFollowUps` | 当前题追问次数 / 上限 | 覆盖 |
| `lastAnswer` | 本轮回答（`turnId` + 文本） | 覆盖 |
| `lastEval` | 本轮评估结果 `{ depth, needFollowUp, reason }` | 覆盖 |
| `status` | `running` / `finished` | 覆盖 |

**图结构**：

```text
                 START
                   |
                   v
          +----------------+   QuestionRetriever 召回 + domain.allocate 分配
          | plan_questions |   -> questionQueue
          +-------+--------+
                  v
          +----------------+   chat 模型流式播报题目 / 追问（messages 流）
     +--->|      ask       |   写 assistant turn
     |    +-------+--------+
     |            v
     |    +----------------+   interrupt() 暂停，等待 Command({ resume: answer })
     |    |  wait_answer   |   无副作用
     |    +-------+--------+
     |            v
     |    +----------------+   judge 模型结构化评估
     |    |    evaluate    |   -> lastEval
     |    +-------+--------+
     |            | 条件边 = domain.routeAfterEvaluate(state)（纯函数）
     |   follow_up | next              | finish
     +-------------+                   v
                              +----------------+  status = finished
                              |    finalize    |  status = finished。诊断报告与入队 diagnose 留到 P2b
                              +-------+--------+
                                      v
                                     END
```

**单轮请求时序**：

```text
POST /api/interviews            { jobId, settings }  -> 201 { id, ... }
  只创建 session（pending）。第一题不在这次请求里流式返回：
  页面马上跳到 /interviews/:id，由用户点「开始」再调 chat。
  这样路由切换不会把创建请求的流掐断。

POST /api/interviews/:id/chat   { answer, idempotencyKey }   -> UI Message Stream
  1. 校验归属。pg_try_advisory_lock 占住这场 session，直到流读完才放开。
     锁是会话级的，不是事务级：事务锁会在返回 Response 时放开，第二请求会排队而不是 409。
     没拿到锁直接 409。
  2. 还没有存档：空 answer 从 plan_questions 开始（第一题）。
  3. 有回答：idempotencyKey 必填。已有 user turn，且后面已经有 assistant turn，
     并且图停在 wait_answer 或已结束 -> 回放那段 assistant 文本。
     已有 user turn 但还停在 wait_answer -> 用已落库的回答 resume，不再插一条。
     已有 user turn 且 next 是别的节点 -> graph.stream(null)，从失败节点续跑。
  4. 新回答：先写 user turn 并提交，再 Command({ resume })。
     空 answer 且 next 不是 wait_answer -> stream(null) 续跑。
     空 answer 且正在等回答 -> 400，避免把中断节点空推一次。
  5. evaluate -> routeAfterEvaluate -> ask(流式) -> wait_answer | finalize
  6. 流里带 data-interview-state。评估 JSON 打 nostream，不进面试官气泡。

GET  /api/interviews/:id        恢复：interview_turns + 存档进度
POST /api/interviews/:id/finish 停在 wait_answer 时 resume { abort: true }；
                                停在别的节点时 updateState 后 stream(null)，走到 finalize
```

- **专项训练**（R-C2-5）：`POST /api/training { reportId, tag }` 创建 `kind = drill` 的 session，技能标签写进 `settings.drillTag`，`plan_questions` 只按它召回，其余流程相同。只允许练这份报告真的判出来的短板，避免用任意标签刷题库。
- **短板优先出题**（R-C2-4）：`plan_questions` 先调 `tools.getOpenWeaknesses`（`userId` 从 config 取），把短板和 JD 技能点一起作为检索查询，再由 `domain.allocate` 把命中短板的题整组排到前面。
- **语音**（P4）：转写终稿作为 `answer` 走同一个 `chat` 用例；`ask` 的文本交 TTS 播放；打断 = 停止播放，状态不变。文字与语音共用图与诊断（R-C2-10）。

### 6.5 C3 诊断图

```text
面试走到 finished（chat 流结束 或 POST /finish）
  -> core.diagnosis.requestDiagnosis(sessionId)
       diagnosis_reports(status = pending, unique(session_id, rubric_version))  # 幂等建档
       -> pg-boss 入队 diagnose { userId, reportId }（singletonKey = reportId）
     触发失败只记日志，不影响面试请求本身
        -> jobs/diagnose -> core.diagnosis.runDiagnosis(reportId)
           status = running
           -> diagnosis 图 (thread = diag:<reportId>，停在某节点时从断点续跑)

  START -> load(报告 + rubrics[report.rubric_version] + turns + 题库题干)
        -> 条件边 fan_out: Send("score_answer", 每题一个)   # 并行；没有可打分的回答时直连 aggregate
        -> score_answer (judge 模型) -> scores[]            # 追加型 Reducer 汇总
        -> aggregate (domain.aggregate：维度分 / 总分 / 技能分，不调模型)
        -> extract_weaknesses (judge 模型只给 [T1] 编号，图回填 turnId 并校验原话)
        -> plan_training (复训计划，只保留已确认短板的条目)
        -> persist (单事务：report(status = done) / weaknesses / skill_score_history
                    + 短板写回档案：domain/weakness/merge 算出历史行的状态变化)
        -> END
  -> 失败 status = failed + error（pg-boss 重试；最终失败可手动重试）

前端: GET /api/reports/:id 轮询状态；POST /api/reports/:id/retry 手动重试
下次面试开场: tools.getOpenWeaknesses -> plan_questions 优先召回短板相关题
```

- **短板写回档案**（R-P3）：`weaknesses` 按报告存（`unique(report_id, tag)`），档案要看的是"这个技能现在算不算短板"，所以读写两边都过 `domain/weakness/merge` 按 `tag` 去重：
  - `occurrences` = 这个技能累计被判为短板的次数；`severity` 取历史与本次的较大值（某一次给低了不淡化反复出现的问题）。
  - 状态流转只看"本场考到了没有"：本次又被判为短板 → `open`；没出现且本场该技能 ≥ 4 分 → `closed`；≥ 3 分 → `improving`；分更低 → 退回 `open`；**本场完全没问到这个技能 → 状态不动**（没问到 ≠ 已解决）。
  - 规则是纯函数，`backend/db` 不允许依赖 `shared/domain`，所以由诊断图算好 `weaknessStatusChanges` 再交给 `saveDiagnosis` 写进同一个事务。
  - 档案页（`GET /api/profile`）和出题（`tools.getOpenWeaknesses`）读的是同一个合并结果，口径只有一处。
- **Rubric 版本化**（R-C3-6）：定义的源头是 `db/seeds/rubrics/<version>.json`，`pnpm db:seed` 校验后 upsert 进 `rubrics`（同一时间只有一个 `active`）。新报告用当前 `active` 版本，旧报告按自己记录的 `rubric_version` 读定义，所以改标准必须新建版本而不是原地改。
- **证据不可编造**（R-C3-2）：Prompt 里把轮次编号成 `[T1] 题：… ｜ 答：…`，模型只能引用编号；编号对不上的短板直接丢弃，原话不在该轮回答里时换成真实摘录。
- **重新诊断不叠加**：`scores` 是唯一的追加型字段，`load` 返回空数组把它清空（LangGraph 里收到空数组即重置），所以同一个 thread 重跑不会把分数累加。

### 6.6 记忆分层

```text
+---------------------+------------------------------------------+---------------------+
| 层级                 | 存储                                      | 用途                 |
+---------------------+------------------------------------------+---------------------+
| 业务长期记忆(真相源)  | profiles / facts / skills / weaknesses / | 跨会话个性化、闭环     |
|                     | skill_score_history                      |                     |
| 会话情景记忆          | interview_turns                          | 诊断、恢复、删除       |
| Agent 工作记忆        | LangGraph 存档 state.messages             | 单场对话上下文         |
|                     | (thread = sessionId, langgraph.*)        |                     |
+---------------------+------------------------------------------+---------------------+
```

**不再设"长期洞察"层**：P3-06 评估后决定只用业务表（见 §1.3）。跨会话的个性化全部来自
`weaknesses`（经 `domain/weakness/merge` 去重）与 `skill_score_history`，一处存储、一处删除。

### 6.7 调试与可视化

| 手段 | 说明 |
|---|---|
| 图结构 | `GET /api/dev/graphs/:name/mermaid` 输出 `graph.getGraph().drawMermaid()`，同时把结果提交到 `docs/graphs/` |
| 存档检查 | `GET /api/dev/threads/:threadId/state` 返回 `getState` 与 `getStateHistory` 摘要（仅开发环境） |
| 时间旅行 | 开发脚本基于历史 checkpoint `updateState` 后重跑，用于复现与学习 |
| LangGraph Studio | 需要 LangSmith 账号（海外服务），**只允许使用测试数据**，可选 |
| Langfuse | docker compose `langfuse` profile 本地自建，**只用测试数据**，可选 |

---

## 7. 检索与向量

### 7.1 题库表

| 字段 | 说明 |
|---|---|
| `id`、`content`、`answer_points` | 题目、参考要点 |
| `skill_tags text[]` | 技能标签（与 JD 技能点同一套标签体系） |
| `difficulty smallint` | 难度 1–5 |
| `type` | 概念 / 场景 / 项目 / 行为 |
| `source`、`license` | 来源与版权 |
| `embedding vector(EMBEDDING_DIM)`、`embed_model` | 向量与所用模型 |
| `search_text` | 用于 `pg_trgm` 关键词召回的拼接文本 |

索引：`embedding` HNSW（`vector_cosine_ops`）、`skill_tags` GIN、`search_text` GIN（`gin_trgm_ops`）。

### 7.2 检索链路

```text
JD 技能点 + 历史短板 + 设置(难度 / 题数 / 类型)
        |
        v
[1] 构造查询：每个技能点 / 短板一条查询文本 -> embed（批量）
        |
        v
[2] 混合召回（每条查询一次 SQL）:
    WHERE embed_model = $current
      AND skill_tags && $tags AND difficulty BETWEEN $lo AND $hi    结构化过滤
    ORDER BY embedding <=> $q LIMIT 20                              向量召回
    (+ 可选 search_text % $kw 关键词召回，两路用 RRF 合并)
        |
        v
[3] 可选重排：MODEL_RERANK（P2a-04 按检索评测决定是否启用）
        |
        v
[4] domain.allocate：短板优先 -> 技能覆盖去重 -> 难度梯度 -> 截取题数
        |
        v
questionQueue（写入图状态）
```

- 封装为 LangChain `BaseRetriever` 子类 `QuestionRetriever`，底层用 `backend/db/vector.ts` 的 SQL。
- `FactRetriever` 同理，作用于 `facts.embedding`，且强制 `user_id = ctx.userId`。
- 检索评测：`evals/retrieval` 维护“JD 技能点 → 期望题目”小样本集，计算 recall@k，用于调参与决定是否启用重排。

### 7.3 题库导入与向量化

```text
db/seeds/questions/*.jsonl --pnpm db:seed--> questions（幂等 upsert，embedding 为空）
                                               |
                                    入队 embed-questions
                                               v
                       批量取 embedding IS NULL 或 embed_model != 当前模型的行
                       -> embed（批大小可配）-> 回写 -> 直到处理完（中断后可续跑）
```

### 7.4 参数

- HNSW 使用默认构建参数起步，查询时按需调整 `hnsw.ef_search`（如 40–100），以检索评测结果为准。
- pgvector 的 `vector` 类型 HNSW 索引维度上限为 2000，选择向量化模型时注意维度。

---

## 8. 数据层

### 8.1 Schema 分工

| 层 | 职责 | 规则 |
|---|---|---|
| `schemas`（Zod） | 领域对象、LLM 结构化输出、API 入参 | 唯一定义源 |
| `backend/db/schema`（Drizzle） | 存储结构 | 用 `drizzle-zod` 生成或在 repo 显式映射，禁止两处各自手写同一结构 |
| 图状态 | LangGraph State | 字段类型引用 `schemas` |

### 8.2 核心数据模型（ER）

```text
users 1──1 profiles 1──* experiences 1──* facts (embedding)
                    1──* skills       (tag, level, evidence_fact_ids)
users 1──* job_targets 1──* job_requirements
job_targets 1──* resumes              (kind=tailored, version, content jsonb, quality jsonb)
users 1──* resumes                    (kind=master, job_target_id 为空，version 在该用户的主简历内递增)
job_targets 1──* interview_sessions   (mode text|voice, kind normal|drill, settings, status)
interview_sessions 1──* interview_turns   (seq, role, content, question_id, is_follow_up, idempotency_key)
interview_sessions 1──1 diagnosis_reports (rubric_version, status, overall, scores jsonb, plan jsonb)
                                          unique(session_id, rubric_version)
diagnosis_reports 1──* weaknesses          (tag, severity, status, evidence_quote)
                                           evidence_turn_id ──> interview_turns
diagnosis_reports 1──* skill_score_history (tag, score, sample_count)  # 成长曲线按 (user_id, tag, created_at)
users 1──* llm_calls                  (session_id, function_id, model, tokens, latency, status)
users 1──* consents                   (purpose, version, granted_at)

全局数据（不含 PII）:
rubrics   (version PK, definition jsonb, active)
questions (content, skill_tags[], difficulty, embedding, embed_model)
deletion_tombstones (hashed_user_id, deleted_at)

独立 schema:
langgraph.*  LangGraph 存档（PostgresSaver 自管）
pgboss.*     任务队列（pg-boss 自管）
```

### 8.3 关键设计

- **数据隔离**：所有用户数据表带 `user_id`，外键 `ON DELETE CASCADE`；Repository 每个方法强制传 `userId` 并写入 where 条件。当前单用户也照此执行，后续上鉴权无需迁移。
- **jsonb 取舍**：整取整存的数据（`resumes.content`、`diagnosis_reports.scores`）用 jsonb，读写都过 Zod；需要统计 / 关联的数据（weaknesses、skill_score_history、job_requirements）单独建表。
- **索引**：常用查询建 `(user_id, created_at desc)`；`interview_turns (session_id, seq)` 唯一；`interview_turns (session_id, idempotency_key)` 唯一；向量与标签索引见 §7.1。
- **迁移**：`drizzle-kit generate` + `migrate`；首个迁移启用 `vector`、`pg_trgm`。`langgraph.*` 由 `checkpointer.setup()` 创建，`pgboss.*` 由 pg-boss 启动时创建。
- **迁移时机**：本地与 CI 通过 `pnpm db:migrate` 执行；`MIGRATE_ON_START=true` 时由 `core/runtime.ts` 在启动阶段（`ensureUser` 之前）持有 advisory lock 后执行迁移，失败则退出。默认 `false`，即开发与生产都把迁移作为独立步骤——此时若漏跑迁移，启动会在 `ensureUser` 处报 `relation "users" does not exist`。幂等性由 `drizzle.__drizzle_migrations` 保证（详见根 README「数据库迁移」）。
- **种子数据**：Rubric、题库由幂等 seed 脚本导入。

### 8.4 一键删除

`DELETE /api/privacy/me`：

| 步骤 | 对象 | 做法 | 方式 |
|---|---|---|---|
| 1 | 业务数据 | 删除 `users` 行，级联删除全部用户数据（含 `llm_calls`、`consents`）；同一事务写入 `deletion_tombstones`（哈希 userId + 时间） | 同步 |
| 2 | LangGraph 存档 | 删除前先取出该用户全部 `sessionId` 与 `reportId`，逐个 `checkpointer.deleteThread()` | 同步 |
| 3 | LangGraph Store | 未启用（§1.3 P3-06），没有要删的命名空间 | — |
| 4 | 队列 | 取消并删除 `pgboss.*` 中载荷含该用户 id 的任务 | 同步 |
| 5 | 会话 | 清除访问 Cookie（正式鉴权上线后为吊销全部会话） | 同步 |
| 6 | 日志 | 日志不含正文与明文 PII（只有 requestId、哈希 userId、业务 id），保留期 ≤ 30 天 | 到期清除 |
| 7 | 备份 | 备份保留期 ≤ 30 天；从备份恢复时先按 `deletion_tombstones` 重放删除 | 到期清除 + 恢复时重放 |

> 日志与备份的最长残留时间要在隐私说明页告知（N-4、N-5）。若启用了本地 Langfuse，仅允许测试数据，不纳入删除流程。

---

## 9. 横切关注点

### 9.1 配置

| 出口 | 使用方 | 内容 |
|---|---|---|
| `shared/env/server` | 后端 | `DATABASE_URL`、`PROVIDERS` / `PROVIDER_*` / `MODEL_*` / `MODEL_CAPS_*`、`EMBEDDING_DIM`、`ALLOWED_PROVIDERS`、`DEV_USER_ID`、`ACCESS_PASSWORD`、`COOKIE_SECRET`、`PORT`、`LOG_LEVEL`、`BACKUP_DIR` |
| `shared/env/client` | 浏览器 | 仅 `VITE_*` 非敏感项 |

- 启动时 Zod 校验，缺失或非法立即退出。
- 业务开关集中在 `backend/core/config.ts`：最大题数、最大追问次数、单场 Token 上限、简历文本长度上限。

### 9.2 可观测

| 手段 | 内容 |
|---|---|
| 日志 | pino，带 `requestId`、`userIdHash`、`sessionId`、`functionId`；不记录简历原文、回答原文 |
| 用量 | `llm_calls`（§5.6），提供按场次的 Token 与成本查询 |
| 图调试 | §6.7 |
| 外部 Trace | 默认不接；学习时可在本地启用 Langfuse（测试数据） |

**`functionId` 规范**：`profile.extract`、`job.extract`、`resume.generate`、`interview.plan`、`interview.ask`、`interview.evaluate`、`diagnosis.score`、`diagnosis.weakness`、`diagnosis.plan`。

### 9.3 错误与降级

| 错误码 | HTTP | 前端行为 |
|---|---|---|
| `VALIDATION` | 400 | 表单提示 |
| `UNAUTHORIZED` / `FORBIDDEN` | 401 / 403 | 跳转口令页 / 提示无权限 |
| `NOT_FOUND` | 404 | 空态 |
| `CONFLICT` | 409 | 刷新状态后重试（并发推进、含 unverified 导出等） |
| `RATE_LIMITED` | 429 | 退避重试 |
| `LLM_TIMEOUT` / `LLM_UNAVAILABLE` | 503 | 提示稍后重试，进度保留 |
| `LLM_SCHEMA_INVALID` | 502 | 提示重试 |
| `BUDGET_EXCEEDED` | 402 | 提示额度用尽 |

**不丢进度**：

- 面试：回答先落库；同一场面试加 advisory lock；`idempotencyKey` 去重；图中途失败时存档停在失败节点之前，重试从该节点续跑；刷新后 `GET /api/interviews/:id` 恢复。
- 诊断：pg-boss 重试 + 诊断图存档续跑；最终 `failed` 可手动重试。
- 简历：生成失败保留上一版本。

**服务韧性**：优雅停机（停止接收新请求 → 等待进行中的流完成或超时 → 停止 pg-boss → 关闭连接池）；`/api/healthz`、`/api/readyz`。

### 9.4 安全与合规

| 项 | 措施 | 对应需求 |
|---|---|---|
| 密钥 | 只在后端 `shared/env/server`；浏览器 bundle 零密钥（CI 检查 `frontend` 中不出现非 `VITE_` 变量） | N-7 |
| 访问控制 | 当前：部署时 `accessGate`（§9.5）；正式鉴权为待补项 | R-A-1 |
| 数据隔离 | Repo 强制 `userId`；工具与检索器从 `config` 取 `userId` | N-6 |
| 限流 | 按 IP；LLM 相关接口更严格；单场 Token 上限 | N-12 |
| CSRF | 同源 + `SameSite=Lax` Cookie；写操作校验 `Origin` | N-6 |
| 上传 | 不上传原文件，只上传提取后的文本；后端限制长度 | N-1、N-2 |
| Prompt 注入 | JD / 简历文本作为数据用分隔符包裹；工具只读且按用户限定 | N-6 |
| PII 脱敏 | 规则在 `shared/common/pii`（零依赖），两个出口各包一层：`agent/llm/redact` 管发给模型的文本（extract / interview / diagnosis / resume 全部节点），`shared/common/logger` 的 `hooks` + `formatters` 管日志（含 `err.message` 与 `stack`）。联系方式在前端先抽走，不进模型 | N-3 |
| 同意 | 上传前单独同意，记录到 `consents`，后端校验 | N-4 |
| 一键删除 | §8.4 | N-5 |
| 偏见 | Rubric 与 Prompt 不使用受保护特征；`evals/bias` 回归 | N-8 |
| 模型合规 | `ALLOWED_PROVIDERS` 开关（§5.5） | N-13、N-14 |
| AI 内容标识 | 面试、简历、报告页面标注“AI 生成”；导出的简历是否需要标识，对外开放前做合规确认 | N-14 |
| 产品边界 | 不提供真实面试实时代答的接口或页面 | R-B-1 |

### 9.5 鉴权（待补项）

| 阶段 | 做法 |
|---|---|
| 现在 | `devUser` 中间件注入固定 `DEV_USER_ID`；所有数据按 `userId` 隔离 |
| 部署到公网（P0 起） | `accessGate`：未通过时只放行口令页与 `/api/healthz`；提交 `ACCESS_PASSWORD`（常量时间比较）后签发 httpOnly、`SameSite=Lax`、`Secure` 的签名 Cookie；口令接口按 IP 限流；魔搭空间尽量设为私有 |
| 对外开放前（B-01） | Better Auth + Drizzle 适配器，邮箱 + 密码；`ALLOW_SIGNUP` 控制注册；替换 `devUser` 为 `auth` 中间件（`ctx` 结构不变）；前端登录页与路由守卫；越权回归 |

### 9.6 测试策略

```text
                 /\
                /  \      LLM 评测: promptfoo（幻觉 / factRef、出题相关性、
               /    \     评分一致性、检索 recall@k、偏见；可对比多个 provider）
              /------\
             /  集成   \   Hono app.request() + 真实 Postgres（compose / CI service）
            /----------\   + 假模型（FakeListChatModel 等），覆盖主链路与中断恢复
           /   图测试    \  单图 + MemorySaver + 假模型：路由、interrupt/resume、续跑
          /--------------\
         /    单元测试      \ domain（route / allocate / factRefGuard / aggregate / merge /
        /------------------\ skillGap）必须覆盖；llm/structured 降级；前端组件
```

### 9.7 CI（可选）

```text
install (pnpm 缓存) -> lint（含分层约束）-> typecheck -> unit + 图测试
  -> integration（Postgres service）-> docker build
  -> [prompts / graphs / rubrics 变更] eval（手动触发，设预算上限）
```

---

## 10. 部署

### 10.1 档位

| 档位 | 方案 | 费用 | 说明 |
|---|---|---|---|
| 0 | 本地 `docker compose up -d db` + `pnpm dev` | 0 | 主力开发环境 |
| **A** | **魔搭 Docker 创空间**：单镜像（Node + 内置 Postgres） | 免费 | 首选；限制见 §10.2 |
| B | 自有电脑 / NAS：`docker compose --profile app up -d` + 内网穿透（cpolar / SakuraFrp） | 0 | 数据完全在本地；机器需常开 |
| C | 轻量服务器：同 B，不需要穿透 | 付费（新用户活动价） | 最省心的兜底 |

> EdgeOne Pages 等 Serverless 平台不作为部署目标：函数时限（最长 120 秒）、无常驻进程（pg-boss、LangGraph 续跑）、需另找境内托管 Postgres。

### 10.2 魔搭单镜像

```text
+-------------------------------------------------------------+
| 容器 (监听 0.0.0.0:7860)                                      |
|                                                             |
|  entrypoint.sh                                              |
|   1. PGDATA=/mnt/workspace/pgdata 不存在 -> initdb           |
|   2. 以 postgres 用户启动 Postgres（只监听 127.0.0.1）         |
|   3. 等待就绪 -> CREATE EXTENSION（幂等）                      |
|   4. 启动 node dist/server/entry.js（PORT=7860）               |
|      -> advisory lock 下执行迁移 -> checkpointer.setup()       |
|      -> pg-boss 启动（含每日 backup 任务）-> 监听               |
|   5. 捕获 SIGTERM：先停 node，再 pg_ctl stop -m fast           |
|                                                             |
|  /mnt/workspace/  (重启后保留)                                 |
|   ├── pgdata/                                               |
|   └── backups/  每日 pg_dump，保留 7 份                        |
+-------------------------------------------------------------+
```

**平台约束**（来自平台文档与社区资料，P0 实测确认）：

| 约束 | 应对 |
|---|---|
| 必须监听 `0.0.0.0:7860`，8080 被占用 | `PORT=7860` |
| 禁止使用 `Authorization`、`X-modelscope-*`、`X-studio-*` 请求头 | 只用 Cookie |
| 只有 `/mnt/workspace` 在重启后保留；转移或重命名空间时数据仍会丢失 | 数据目录与备份放在 `/mnt/workspace`；定期手动下载备份 |
| 闲置会休眠，免费时长有限制 | 休眠后首个请求较慢；Postgres 依赖崩溃恢复，P0 验证 |
| 空间可见性 | 尽量设为私有；无论如何启用 `accessGate` |

**Dockerfile 要点**：多阶段构建（构建阶段 `pnpm build`；运行阶段 Node 基础镜像 + PGDG 源安装 `postgresql` 与 `postgresql-*-pgvector`）；运行阶段只拷贝 `dist/`、生产依赖、`db/migrations`、`db/seeds`、`deploy/modelscope/entrypoint.sh`。

### 10.3 P0 需实测

1. SSE 在魔搭网关后不被缓冲，记录首字延迟。
2. 重启、休眠后 `/mnt/workspace/pgdata` 数据一致，Postgres 能正常恢复。
3. Cookie 与 `accessGate` 在平台域名下正常工作。
4. 镜像体积与冷启动时间可接受。

**本地实测结果（2026-10-23，`docker run -v <volume>:/mnt/workspace` 模拟）**：

| 项目 | 结果 |
|---|---|
| 镜像体积 | 766 MB |
| 冷启动（含 initdb）/ 重启 | 3 s / 2 s 到 `/api/healthz` 可用 |
| SSE 响应头 | `text/event-stream`、`Cache-Control: no-cache, no-transform`、`X-Accel-Buffering: no`；逐字输出，首字 ≈ 70 ms |
| 容器重启后数据 | 回声图存档、`llm_calls` 完整，可直接 resume |
| 优雅停机 | SIGTERM → node 停止接收请求并退出 → `pg_ctl stop -m fast` |
| accessGate | 未登录：页面 / API / 静态资源均 401，`/api/healthz` 放行；登录后签名 httpOnly Cookie 生效 |
| 备份 | pg-boss 按 `BACKUP_CRON` 执行 `pg_dump -Fc`，保留 7 份；`pg_restore` 到新库验证可恢复 |

**平台侧待实测**（上线魔搭后补记）：网关是否缓冲 SSE、休眠唤醒后的恢复、平台域名下 Cookie 行为。

---

## 11. 关键接口约定（类型层面）

```ts
// src/shared/common/ctx.ts
export interface RequestCtx {
  userId: string;
  requestId: string;
}

// src/agent/llm/registry.ts
export type ChatAlias = 'chat' | 'judge' | 'extract' | 'fallback';
export interface ModelCaps {
  jsonSchema: boolean;
  tools: boolean;
  jsonMode: boolean;
  reasoning: boolean;
  contextWindow: number;
}
export declare function getChatModel(alias: ChatAlias): { model: BaseChatModel; id: string; caps: ModelCaps };
export declare function getEmbeddings(): { model: Embeddings; id: string; dim: number };

// src/agent/llm/structured.ts
export interface CallMeta {
  functionId: string;
  promptVersion: string;
  sessionId?: string;
}
export declare function generateStructured<T extends z.ZodTypeAny>(
  alias: ChatAlias,
  schema: T,
  messages: BaseMessage[],
  meta: CallMeta,
): Promise<z.infer<T>>;

// src/agent/graphs/interview/state.ts
export const InterviewState = Annotation.Root({
  ...MessagesAnnotation.spec,
  questionQueue: Annotation<QueuedQuestion[]>,
  cursor: Annotation<number>,
  followUpCount: Annotation<number>,
  maxFollowUps: Annotation<number>,
  lastAnswer: Annotation<{ turnId: string; text: string } | null>,
  lastEval: Annotation<AnswerEvaluation | null>,
  status: Annotation<'running' | 'finished'>,
});

// src/agent/graphs/config.ts —— 通过 config.configurable 注入
export interface GraphConfigurable {
  thread_id: string;
  userId: string;
  requestId: string;
}

// src/shared/domain/interview/route.ts —— 条件边的唯一判断来源
export type RouteDecision = 'follow_up' | 'next' | 'finish';
export declare function routeAfterEvaluate(input: {
  cursor: number;
  queueLength: number;
  followUpCount: number;
  maxFollowUps: number;
  needFollowUp: boolean;
  aborted: boolean;
}): RouteDecision;

// src/agent/retrieval/question-retriever.ts
export interface QuestionQuery {
  skills: string[];
  /** 一条 JD 要求或一条历史短板的描述，和 skills 一起向量化 */
  text?: string;
  difficulty?: [number, number];
  types?: QuestionType[];
  k: number;
}
export declare class QuestionRetriever extends BaseRetriever {
  retrieve(q: QuestionQuery): Promise<RetrievedQuestion[]>;
}

// src/shared/domain/weakness/merge.ts —— 短板写回档案（R-P3）
export declare function mergeWeaknesses(input: {
  existing: readonly ExistingWeakness[];
  /** 本次诊断确认的短板；只读档案时不传 */
  incoming?: readonly IncomingWeakness[];
  /** 本场技能分，用来判断旧短板是否已改善 */
  skills?: readonly { tag: string; score: number }[];
}): { profile: MergedWeakness[]; statusChanges: { id: string; status: WeaknessStatus }[] };

// src/agent/tools/weaknesses.ts —— userId 只从 config 取，不做成模型可见的参数
export declare function getOpenWeaknesses(
  config: LangGraphRunnableConfig,
  opts?: { limit?: number },
): Promise<MergedWeakness[]>;

// src/agent/llm/pricing.ts —— 元 / 百万 token，按 provider:model 配置
export declare function estimateCost(input: {
  provider: string;
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
}): number | null;

// src/agent/voice/types.ts —— P4
export interface VoiceProvider {
  transcribe(ctx: RequestCtx, audio: Blob): Promise<{ text: string; durationMs: number }>;
  synthesize(ctx: RequestCtx, text: string): Promise<ReadableStream<Uint8Array>>;
}

// src/shared/common/errors.ts
export interface ApiError {
  code: AppErrorCode;
  message: string;
  requestId: string;
  details?: unknown;
}
```

- `QueuedQuestion`、`AnswerEvaluation`、`RetrievedQuestion`、`QuestionType` 定义于 `schemas`。
- LangGraph 的 State 定义方式（`Annotation` 或 Zod）、`PostgresSaver` 的 schema 选项、`deleteThread` 等 API 以登记的主版本文档为准。

---

## 12. 性能要点

- **出题检索**只在开场做一次；每轮只有 1 次结构化评估 + 1 次流式生成，首字延迟主要取决于模型。
- **模型分级**：评估用低延迟的 `judge`（非推理模型），生成用 `chat`；诊断异步执行，不阻塞面试页。
- **诊断并行**：逐题打分用 `Send` 并行，并发数受 provider 限流约束（`backend/core/config.ts` 可配）。
- **存档体积**：`messages` 只保留本场对话；单场题数与追问次数有上限，存档体积可控。
- **数据库**：常驻进程使用连接池；Drizzle、PostgresSaver、pg-boss 合计连接数控制在 10 以内。
- **前端**：按路由分包；PDF 文本提取的 pdf.js worker 懒加载。

---

## 13. 工程约束清单

| # | 约束 | 架构落点 |
|---|---|---|
| 1 | **密钥安全**：模型 Key 只存在后端 | §2.3、§9.1、§9.4 |
| 2 | **模型可替换**：业务只用别名；换 provider 只改环境变量 | §5 |
| 3 | **Schema 先行**：LLM 结构化输出与 API 入参用 Zod 校验，禁止裸解析字符串 | §5.2、§8.1 |
| 4 | **事实溯源**：简历每条描述带 `factRefs`，未关联事实的内容不得导出。简历标准只附加检查结果，不放宽这条 | §6.3、`shared/domain/resume/fact-ref-guard.ts`、`shared/domain/resume/standard.ts` |
| 5 | **图的约定**：路由判断在 `domain`；`interrupt` 节点无副作用；工具只读；`userId` 从 config 注入 | §1.2 |
| 6 | **不丢进度**：回答先落库、幂等、加锁、存档续跑 | §6.4、§9.3 |
| 7 | **隐私合规**：PII 最小化、脱敏、一键删除（含存档、队列、日志、备份）；数据结构在 P2b 结束前定稿 | §8.3、§8.4、§9.4 |
| 8 | **产品边界**：不实现真实面试场景的实时代答 | §9.4 |
| 9 | **版本意识**：AI 相关依赖引入 / 升级前以官方最新文档为准并登记主版本 | §1.4 |
| 10 | **分层边界**：`client` 只 import 后端类型；`core` 及以下不依赖框架；路由层不写业务逻辑 | §2.3 |
| 11 | **平台收口**：平台差异只出现在 `entry.ts`、`env`、`Dockerfile`、`deploy/` | §0、§10 |

---

## 变更记录

| 日期 | 变更 |
|---|---|
| 2026-10-22 | 初版技术栈与架构基准 |
| 2026-10-23 | 合并工程架构方案：确定 pnpm Monorepo + 前后端物理分离；新增 Hono、契约工具链、TanStack Query、MSW、pg-boss、Turborepo 等；部署调整为前端 Vercel + 后端容器；补充工程结构、运行时链路、数据层、横切约束 |
| 2026-10-23 | 修订：§1.2 正式鉴权决策提前到 P0 / P1（随 DB 托管），P1-00 上线最小鉴权；同源转发补语音例外与“api 只接受代理来的流量”（新增 `proxy-guard`、`env/web-server`，转发由 rewrites 改为 `middleware.ts` 以注入代理凭证）；替换边界补 Cookie 与 CSRF 配置；§6.5 一键删除补 Langfuse、日志、备份；需求编号对齐 01 修订版 |
| 2026-10-23 | **重写**：项目定位改为个人项目（1 人、学习性质，本地优先、免费平台部署、国内优先）。主要变更见下表 |
| 2026-10-23 | P0 完成：§1.3 流式适配定为 `@ai-sdk/langchain`、部署平台暂定魔搭；§1.4 登记主版本；§10.3 补本地实测结果。实现补充：provider 新增 `fake` kind（离线假模型，无 Key 时跑通链路）；`llm` 层只定义 `UsageCallbackHandler`，写库的 sink 由 `core/usage.ts` 注入（保持 llm 不依赖 db） |
| 2026-10-23 | 目录重组：`src/` 按 `frontend` / `backend/{server,core,db,jobs}` / `agent/{graphs,llm,prompts,...}` / `shared/{domain,schemas,env,common}` 四块物理分目录；§2.2、§2.3、§3 与全文路径同步更新，ESLint 分层规则随之调整；新增 [04 · 代码地图](04-code-map.md) |
| 2026-10-24 | P1-08：向量列固定 1024 维；默认同进程 n-gram 哈希（`fake:ngram-1024`），换 bge-m3 只改 `MODEL_EMBED` 并按 `embed_model` 重嵌。简历生成用 `streamMode: "custom"` 吐 JSON 文本（`text/plain`），前端 `useObject` 边解析边渲染；回声图仍走 UI Message Stream |
| 2026-10-25 | P2a：题库表、面试会话与轮次、216 道前端题、`embed-questions`、QuestionRetriever（关键词 + RRF，不重排）。面试图 plan → ask → wait_answer → evaluate → 追问/下一题/结束。创建面试只返回 id，第一题由随后的 chat 拉起。finalize 只把场次标成 finished，诊断留到 P2b |
| 2026-10-25 | P2b：Rubric 版本化（源头 `db/seeds/rubrics/*.json` → `rubrics` 表，报告记录所用版本）、`diagnosis_reports` / `weaknesses` / `skill_score_history` 建表定稿。诊断图用 `Send` 并行逐题打分 + 追加型 Reducer 汇总，`thread = diag:<reportId>`；短板证据由图回填校验（模型只给 `[T1]` 编号）。触发点由 finalize 节点调整为 `core.interview` 在场次变成 finished 后触发（`agent/graphs` 不允许依赖 `backend/core`），`agent/rubrics` 只负责把定义渲染成提示词文本。报告页雷达图手写 SVG，不引图表库 |
| 2026-10-25 | P3：复训闭环 + 用量 + PII 脱敏。§1.3 新增结论 P3-06 **仅业务表、不启用 LangGraph Store**。短板写回档案用 `domain/weakness/merge`（按 tag 去重、严重度取较大值、状态只在"本场考到"时才流转），规则由诊断图算出后随 `saveDiagnosis` 写进同一事务（`backend/db` 不许依赖 `shared/domain`）。新增 `agent/tools/weaknesses.ts`（`userId` 只从 config 取，ESLint 只给 `agent/tools` 开了 `agent/graphs/config.ts` 一个口子）；专项训练用 `interview_sessions.kind = 'drill'` + `settings.drillTag`，不另开链路。PII 规则下沉到 `shared/common/pii.ts`，模型入口与 pino 日志共用（日志侧用 `hooks.logMethod` + `formatters.log` 兜底）。成本用 `agent/llm/pricing.ts` 现算不落库，单价缺失返回 `null`；诊断的调用也挂在面试 `session_id` 上。副作用：用量回调会在模型调用链里 `await` 一次写库，并行打分有分支快速失败时其余分支会被一起中止，续跑可能多打一两题（分数按唯一键 upsert，不会叠加），p2b 的相应断言已放宽并写明原因 |
| 2026-10-27 | P6：主简历与简历标准。`skills` 增加 `level`、`evidence_fact_ids`；`resumes.job_target_id` 可空，增加 `kind`（`master` / `tailored`）和 `quality`。简历图在 guard 之后增加不调模型的 `standard` 节点。无 `jobId` 时按经历顺序带入最多 24 条事实。读取简历时按当前档案重算 `quality`，导出仍只看 `unverified`。教育经历与作品链接不做 |

### 本次重写的选型变更

| 项 | 原选型 | 新选型 | 原因 |
|---|---|---|---|
| 工程形态 | pnpm Monorepo + Turborepo，`apps/web` + `apps/api` + `apps/worker` + `apps/studio` | 单仓单 package、单 Node 进程 | 1 人开发，降低部署与维护成本 |
| 前端 | Next.js（Vercel） | Vite + React SPA，由后端托管静态资源 | 无 SSR 需求；Vercel 国内访问不稳定 |
| 前后端契约 | contracts + OpenAPI + api-client 生成 + MSW + oasdiff | Hono RPC 共享类型 | 无前后端分工，不需要契约生成链路 |
| 同源转发 | `middleware.ts` + `proxy-guard` + 代理凭证 | 单进程同源 | 不再有两个服务 |
| Agent 框架 | Mastra（Workflow / Memory / Studio） | LangGraph.js | 面试循环契合“有环图 + interrupt + 存档”；学习价值高 |
| 面试状态 | 自写 reducer + `interview_sessions.state` jsonb | LangGraph 存档（`PostgresSaver`）+ `domain` 纯函数路由 | 状态持久化与恢复交给框架，判断逻辑仍可单测 |
| 模型调用 | Vercel AI SDK Core | LangChain 模型类 + 自研注册表、能力表、结构化输出降级 | 与 LangGraph 原生集成；provider 可替换 |
| 模型约束 | 只用已备案模型 | 个人使用阶段可接个人付费模型；对外开放时用 `ALLOWED_PROVIDERS` 收紧 | 个人使用需求 |
| 数据库托管 | Supabase / Neon | 本地 compose；部署时镜像内置 Postgres | 境外托管不满足境内存储；免费 |
| 任务 | pg-boss + 独立 worker | pg-boss 在应用进程内消费 | 免费平台只有一个容器 |
| 向量检索 | pgvector（题库） | pgvector + 结构化过滤 + 可选关键词召回与重排；题库与事实两个检索器 | 题库规模数百以上 |
| 可观测 | Langfuse | pino + `llm_calls` 表；Langfuse 仅本地可选 | Langfuse Cloud 在境外，自建过重 |
| 简历解析 / 导出 | 后端 unpdf / 后端 @react-pdf/renderer | 浏览器端 unpdf / HTML 打印 | 原文件不出浏览器；中文字体无负担 |
| 鉴权 | P1-00 上线 | 待补项；先 `devUser` + 部署时 `accessGate` | 个人使用优先级低 |
| 部署 | Vercel + 容器平台 | 魔搭 Docker 创空间（首选）/ 自有机器 / 轻量服务器 | 免费、国内 |
| 测试 | 含 Playwright E2E、dependency-cruiser | 集成测试 + 图测试；ESLint 分层约束；E2E 移入待补项 | 降低维护成本 |
