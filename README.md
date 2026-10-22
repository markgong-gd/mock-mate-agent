# MockMate Agent

求职者侧智能面试 Agent：**职业档案 → 简历定制 → 模拟面试 → 能力诊断 → 定向复训** 的闭环。

## 核心能力

- **C1 简历定制**：结合个人经历与目标岗位 JD 生成可溯源的定制简历
- **C2 面试训练**：基于岗位要求进行多轮、可追问的模拟面试（文字 → 语音）
- **C3 诊断与复训**：多维 Rubric 诊断短板，并自动生成针对性训练

## 文档

| 文档 | 说明 |
|---|---|
| [01 · 产品调研](docs/01-product-research.md) | 需求、核心洞见、风险、量化证据 |
| [02 · 技术栈与架构基准](docs/02-tech-stack.md) | 技术选型、系统架构、数据模型、开发路线、工程约束 |
| [03 · 开发任务计划清单](docs/03-dev-plan.md) | 分阶段任务、验收标准、进度跟踪 |

> 后续开发以上述文档为基准，技术选型变更需先更新 `docs/02-tech-stack.md`。

## 技术栈概览

Next.js · TypeScript · Vercel AI SDK · Mastra · Postgres + pgvector · Drizzle · Zod · Langfuse
