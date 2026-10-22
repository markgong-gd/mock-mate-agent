# 02 · 技术栈与架构基准

> 本文是 MockMate 后续开发的**技术基准**。新增 / 替换技术选型需先更新本文档。
> 原则：**TypeScript 全栈、前端友好、先文字后语音、闭环优先**。

## 1. 总体分层

```
┌──────────────────────────────────────────────────────────────┐
│ 前端/交互层  Next.js (App Router) + React + TypeScript        │
│              Vercel AI SDK UI (useChat / useObject)           │
│              assistant-ui / shadcn/ui                         │
├──────────────────────────────────────────────────────────────┤
│ Agent 编排层 Mastra（主框架：Agent / Workflow / Memory）      │
│              LangGraph.js（可选：复杂面试循环图编排）          │
│              Vercel AI SDK Core（统一模型调用、工具、结构化输出）│
├──────────────────────────────────────────────────────────────┤
│ 语音面试层   OpenAI Realtime API (WebRTC) / OpenAI Agents SDK │
│              备选：LiveKit Agents (Node) / ElevenLabs / Vapi  │
├──────────────────────────────────────────────────────────────┤
│ 知识与记忆   Postgres + pgvector（Supabase 或 Neon）           │
│              Drizzle ORM + Zod Schema                         │
│              Mastra Memory（备选 Mem0）                        │
├──────────────────────────────────────────────────────────────┤
│ 工具协议     MCP TypeScript SDK (@modelcontextprotocol/sdk)    │
├──────────────────────────────────────────────────────────────┤
│ 可观测/评测  Langfuse（OpenTelemetry tracing）                │
│              promptfoo / Mastra Evals（回归评测）              │
├──────────────────────────────────────────────────────────────┤
│ 部署         Vercel（首选）/ Cloudflare Workers               │
└──────────────────────────────────────────────────────────────┘
```

## 2. 选型清单

### 2.1 已确定（基准）

| 层 | 选型 | 用途 |
|---|---|---|
| 语言 | TypeScript（strict） | 全栈统一 |
| 包管理 | pnpm | Monorepo / workspace |
| Web 框架 | Next.js (App Router) | 页面、Route Handler、Server Actions |
| UI | React + Tailwind CSS + shadcn/ui | 组件体系 |
| 对话 UI | Vercel AI SDK UI、assistant-ui | 流式对话、结构化流式渲染 |
| 模型调用 | Vercel AI SDK Core | `streamText` / `generateObject` / tool calling，屏蔽模型厂商差异 |
| Agent 框架 | Mastra | 三专职 Agent、Workflow、Memory、Evals、本地 Playground |
| Schema | Zod | 简历、JD、Rubric、诊断报告等结构化数据的唯一定义源 |
| 数据库 | Postgres + pgvector | 职业档案、会话记录、向量检索（JD / 题库 / 面经） |
| ORM | Drizzle | 类型安全的数据访问与迁移 |
| 可观测 | Langfuse | Trace、Prompt 管理、成本统计 |
| 评测 | promptfoo / Mastra Evals | 提问质量、评分一致性、幻觉回归 |
| 简历解析 | unpdf / pdf.js + LLM 结构化抽取 | 上传简历 → 职业档案 |
| 简历导出 | @react-pdf/renderer | 生成 PDF 简历 |

### 2.2 待定（按阶段决策）

| 事项 | 候选 | 决策时机 |
|---|---|---|
| 复杂面试循环编排 | Mastra Workflow vs LangGraph.js | 阶段 2，若 Mastra Workflow 无法优雅表达追问循环再引入 LangGraph.js |
| 语音方案 | OpenAI Realtime / LiveKit Agents / ElevenLabs / Vapi | 阶段 4 |
| 长期记忆 | Mastra Memory vs Mem0 | 阶段 3 |
| 数据库托管 | Supabase vs Neon | 阶段 1 |
| 主力模型 | 通过 AI SDK Provider 切换，不绑定厂商 | 持续评估 |
| 低代码原型（Dify / Coze） | 仅用于验证想法，不进入主干 | — |

## 3. 系统架构

```
                    ┌──────────────────────────┐
                    │  统一职业档案 (Postgres)   │◄──── 简历上传 / 解析
                    │  经历 / 技能 / 事实 / 得分 │
                    └────────────┬─────────────┘
                                 │ 读写
     ┌───────────────────────────┼───────────────────────────┐
     ▼                           ▼                           ▼
┌────────────┐  JD+档案   ┌───────────────┐  对话记录  ┌───────────────┐
│ 简历 Agent  │──────────►│ 面试官 Agent   │─────────►│ 诊断 Agent     │
│ (C1)        │           │ (C2)          │           │ (C3)          │
└─────┬──────┘           └──────┬────────┘           └──────┬────────┘
      │                         │                           │
 generateObject           useChat 文字 /              多维 Rubric 打分
 + Zod 简历 Schema         Realtime 语音               generateObject
 + 事实溯源校验            追问循环 Workflow            → 短板列表
      │                         ▲                           │
      ▼                         │      定向复训计划           │
 react-pdf 导出                 └───────────────────────────┘
                                     (闭环 = 核心差异化)

  ─────────────── 横切：MCP 工具 / RAG 检索 / Langfuse Trace ───────────────
```

### 3.1 三专职 Agent 职责

| Agent | 输入 | 输出 | 关键约束 |
|---|---|---|---|
| 简历 Agent（C1） | 职业档案 + JD | 结构化简历（Zod）+ PDF | 每条描述必须关联档案中的事实 ID，禁止编造 |
| 面试官 Agent（C2） | JD 技能点 + 档案 + 历史短板 + 题库检索 | 多轮面试对话 | 支持追问；优先针对历史短板出题 |
| 诊断 Agent（C3） | 面试对话记录 + Rubric | 诊断报告 + 短板列表 + 复训计划 | 结构化输出；短板写回职业档案 |

### 3.2 面试循环（C2 状态机）

```
  ┌────────┐    ┌──────────┐    ┌──────────────┐
  │ 出题    │───►│ 等待回答  │───►│ 评估是否追问  │
  └────────┘    └──────────┘    └──────┬───────┘
      ▲                                │
      │          追问 ┌────────────────┤
      │               ▼                │ 不追问
      │         ┌──────────┐           ▼
      │         │ 生成追问  │     ┌──────────┐  是  ┌──────────┐
      │         └────┬─────┘     │ 题目用尽? │────►│ 结束→诊断 │
      │              │           └────┬─────┘     └──────────┘
      │              ▼                │ 否
      │        （回到等待回答）          │
      └───────────────────────────────┘
```

### 3.3 诊断 Rubric（初版维度）

| 维度 | 说明 |
|---|---|
| 技术深度 | 回答对 JD 技能点的掌握程度 |
| 结构化表达 | 是否符合 STAR 等结构 |
| 岗位匹配度 | 经历与 JD 要求的契合程度 |
| 沟通流畅度 | 表达清晰度、简洁度（语音阶段可加入语速、停顿） |

> Rubric 以 Zod Schema 定义，版本化管理，评分需通过评测集验证一致性。

## 4. 核心数据模型（初版概念）

```
UserProfile (职业档案)
 ├── Experience[]   工作 / 项目经历
 ├── Fact[]         可溯源的事实条目（简历描述引用其 id）
 ├── Skill[]        技能 + 自评 / 诊断得分
 └── Weakness[]     诊断得出的短板（驱动复训）

JobTarget (目标岗位)
 ├── rawJD
 └── requirements[] 结构化技能要求

Resume          (profileId, jobTargetId, sections[], factRefs[])
InterviewSession(profileId, jobTargetId, mode: text|voice, turns[])
DiagnosisReport (sessionId, rubricVersion, scores[], weaknesses[], plan[])
```

## 5. 开发路线

```
阶段1 (1-2周)  Next.js + AI SDK：简历解析 → 职业档案 → JD 匹配 → 简历生成   [C1]
      │
阶段2 (2-3周)  Mastra：面试官 Agent（文字）+ Rubric 诊断 + 会话持久化         [C2/C3]
      │
阶段3 (2周)    闭环：短板写回档案 → 定向出题；接入 Langfuse                  [闭环]
      │
阶段4 (2-3周)  语音：OpenAI Realtime / LiveKit 实时语音面试                  [C2+]
      │
阶段5          评测与合规：promptfoo 回归、PII 脱敏、数据删除与授权            [风险]
```

## 6. 工程约束

1. **密钥安全**：模型 API Key 只存在服务端（Route Handler / Server Actions）；Realtime 语音使用服务端签发的临时 token。
2. **Schema 先行**：所有 LLM 结构化输出必须用 Zod 定义并校验，禁止裸解析字符串。
3. **事实溯源**：简历 Agent 输出必须携带 `factRefs`，未关联事实的内容不得输出。
4. **可观测**：所有 Agent 调用接入 Langfuse Trace；关键链路需有重试与降级。
5. **隐私合规**：PII 最小化存储，支持用户一键删除档案与会话数据；数据结构在阶段 2 前定稿。
6. **产品边界**：不实现真实面试场景的实时代答功能。
7. **版本意识**：AI SDK、Mastra 等迭代快，引入或升级依赖前以官方最新文档为准，并在本文档记录主版本。
