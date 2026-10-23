# MockMate Agent

求职者侧智能面试 Agent：**职业档案 → 简历定制 → 模拟面试 → 能力诊断 → 定向复训** 的闭环。

个人项目，带学习性质：本地优先，可部署到免费平台（国内优先）个人使用。

## 核心能力

- **C1 简历定制**：结合个人经历与目标岗位 JD 生成可溯源的定制简历
- **C2 面试训练**：基于岗位要求进行多轮、可追问的模拟面试（文字 → 语音）
- **C3 诊断与复训**：多维 Rubric 诊断短板，并自动生成针对性训练

## 文档

| 文档 | 说明 |
|---|---|
| [01 · 产品需求](docs/01-requirements.md) | 目标与定位、功能需求（带编号）、非功能需求、洞见、风险、量化证据 |
| [02 · 技术选型与技术架构](docs/02-architecture.md) | 选型与待定项、分层与依赖规则、工程结构、模型层、LangGraph 运行时、检索、数据层、部署 |
| [03 · 落地计划](docs/03-delivery-plan.md) | 里程碑、分阶段任务（验收 / 需求 / 学习点）、待补项、决策点、进度跟踪 |

> 后续开发以上述文档为基准，技术选型或架构边界变更需先更新 `docs/02-architecture.md`。

## 技术栈概览

- **形态**：单仓、单个 Node 进程（API + 静态资源 + 进程内任务）+ PostgreSQL
- **前端**：Vite · React · React Router · Tailwind + shadcn/ui · TanStack Query · AI SDK UI（`useChat` / `useObject`）
- **后端**：Hono · Hono RPC（前后端共享类型）· Zod · Drizzle · pg-boss · pino
- **Agent**：LangGraph.js（`PostgresSaver` 存档、`interrupt` 中断恢复、`Send` 并行）· LangChain 模型类
- **模型**：自研模型注册表，业务只用别名（`chat` / `judge` / `extract` / `fallback` / `embed`），换 provider 只改环境变量
- **检索**：PostgreSQL + pgvector（HNSW）+ 结构化过滤，可选关键词召回与重排
- **部署**：本地 docker compose；线上首选魔搭 Docker 创空间（单镜像内置 Postgres）

## 本地运行（规划）

```bash
cp .env.example .env          # 填写模型 provider 与 Key
docker compose up -d db       # 启动 Postgres + pgvector
pnpm install
pnpm db:migrate && pnpm db:seed
pnpm dev                      # 同时启动前端（Vite）与后端（Hono）
```
