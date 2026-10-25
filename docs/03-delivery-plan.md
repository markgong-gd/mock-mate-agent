# 03 · 落地计划

> 需求见 [01 · 产品需求](01-requirements.md)，技术方案见 [02 · 技术选型与技术架构](02-architecture.md)。
>
> **标记规则**：`⬜ 未开始` → `🚧 进行中` → `✅ 已完成`（完成后可在行尾追加完成日期，如 `(10-25)`）。每完成一项，同步更新「进度总览」中的计数。
>
> **学习点**：每项任务标注对应的 LangGraph / LangChain / 检索概念，便于边做边学。

## 1. 投入、工期与里程碑

### 1.1 投入假设

- 1 人开发，个人项目，带学习性质；按**人日**估算（1 人日 ≈ 6 小时专注开发），日历工期取决于每周投入。
- 估算精度约 ±30%；学习新概念的时间已计入 P0、P2a。
- 题库内容由本人负责（规范见 P1-13）。

### 1.2 工期表

| 阶段 | 内容 | 人日 | 累计（取上限） | 里程碑 |
|---|---|---|---|---|
| P0 | 工程骨架与技术验证 | 5–7 | 7 | M0 |
| P1 | C1 简历定制 | 9–11 | 18 | M1 |
| P2a | 题库检索 + C2 文字面试 | 9–12 | 30 | M2a |
| P2b | C3 诊断 | 6–8 | 38 | M2 |
| P3 | 复训闭环 + 用量 + PII 脱敏 | 7–9 | 47 | M3 |
| P4 | 语音面试 | 8–12 | 59 | M4 |
| P5 | 评测与合规 | 6–8 | 67 | M5 |
| **合计** | | **50–67** | | |

> 参考：按每周投入 2.5 人日（约 15 小时）计算，约 5–7 个月。

```text
阶段   P0     P1         P2a          P2b      P3        P4           P5
      [===][========][==========][======][=======][==========][======]
         M0^       M1^         M2a^     M2^      M3^         M4^     M5^
```

### 1.3 里程碑

| 里程碑 | 完成标志 |
|---|---|
| M0 | 本地 `pnpm dev` 跑通；改环境变量即可切换 provider；最小 LangGraph 图能流式输出、中断、进程重启后恢复；魔搭线上需口令访问 |
| M1 | 上传简历 + 粘贴 JD，打印导出定制简历；含未溯源条目时拒绝导出 |
| M2a | 题库按 JD 技能点检索出题；完成一场文字模拟面试（含追问），刷新或进程重启后可继续 |
| M2 | 面试结束后异步拿到诊断报告；主链路集成测试通过 |
| M3 | 第二次面试自动针对上次的短板出题（闭环 MVP）；日志与 `llm_calls` 中没有明文 PII；可查看单场成本 |
| M4 | 可以进行语音面试（按住说话），并生成诊断报告 |
| M5 | 评测回归 + 一键删除 + 隐私说明完成；可用评测结果选定主力模型 |

### 1.4 每阶段节奏

```text
阶段启动 -> Schema / 表结构先行
              |
              +--> domain 纯函数 + 单测
              +--> 图 / 检索（先用假模型跑通，再接真实模型）
              +--> 路由 + 页面
              |
         集成测试 -> 验收 -> 更新本文进度 -> 决策写入 02 §1.3
```

## 2. 进度总览

| 阶段 | 目标 | 任务数 | 已完成 | 状态 |
|---|---|---|---|---|
| P0 | 工程骨架与技术验证 | 7 | 5 | 🚧 |
| P1 | C1 简历定制 | 13 | 13 | ✅ |
| P2a | 题库检索 + C2 文字面试 | 10 | 0 | ⬜ |
| P2b | C3 诊断 | 6 | 0 | ⬜ |
| P3 | 复训闭环 + 用量 + PII 脱敏 | 9 | 0 | ⬜ |
| P4 | 语音面试 | 7 | 0 | ⬜ |
| P5 | 评测与合规 | 8 | 0 | ⬜ |
| **合计** | | **60** | **18** | |
| 待补项 | 鉴权等（§9） | 7 | 0 | ⬜ |

---

## P0 · 工程骨架与技术验证（M0）

| 状态 | ID | 任务 | 验收标准 | 学习点 |
|---|---|---|---|---|
| ✅ | P0-01 | 初始化单仓：pnpm、TS strict、Vite + React + React Router、Hono（`@hono/node-server`）、`tsx watch`、`tsup`；ESLint（含 `import/no-restricted-paths` 分层规则）+ Prettier + Vitest；按 02 §3 建目录 | `pnpm dev` 同时启动前后端，Vite 代理 `/api`；`pnpm lint` / `typecheck` / `test` 通过；违反分层的引用被 lint 拦截 | — (10-23) |
| ✅ | P0-02 | `env`（Zod 校验）+ `.env.example`；docker compose（`pgvector/pgvector`）；Drizzle 接入，首个迁移启用 `vector`、`pg_trgm`；中间件 `requestId` / `devUser` / `error`；`/api/healthz`、`/api/readyz` | 缺少变量时启动报错；`pnpm db:migrate` 成功；错误响应为 `{ code, message, requestId }` | — (10-23) |
| 🚧 | P0-03 | 模型层：`llm/providers`、`registry`、`caps`、`structured`、`resilience`、`usage`；至少接入 2 个 provider（如 1 个免费 + 1 个付费，或 Ollama）；`llm_calls` 表；`GET /api/llm/ping?alias=` | 只改 `.env` 即可切换 provider；在仅支持 json_mode 的模型上，结构化输出经 Zod 修复重试通过；`llm_calls` 有记录且不含正文（代码与单测已完成：deepseek / openai-compatible / ollama / fake 四种 kind；**待用真实 Key 实测 2 个 provider**） | ChatModel、`withStructuredOutput`、Callbacks |
| ✅ | P0-04 | 最小 LangGraph 图：`ask → wait_answer(interrupt) → reply` 的回声问答图 + `PostgresSaver`；经 `graphs/stream.ts` 流到前端 `useChat`；`/api/dev/threads/:id/state` | 逐字输出、无缓冲，记录首字延迟；刷新页面和进程重启后都能 resume；流式适配方式决策写入 02 §1.3 | StateGraph、Annotation、`interrupt` / `Command`、Checkpointer、`streamMode` (10-23) |
| ✅ | P0-05 | 前端基线：Tailwind + shadcn/ui、TanStack Query、`hc<AppType>` 客户端、布局与路由骨架 | 前端调用 ping 接口有完整类型提示 | — (10-23) |
| 🚧 | P0-06 | 魔搭部署 hello：`Dockerfile`（Node + 内置 Postgres）、`deploy/modelscope/entrypoint.sh`、`PORT=7860`；`accessGate` 中间件 + 口令页；每日 `pg_dump` 备份任务 | 线上访问需口令；重启 / 休眠后数据仍在；SSE 不被缓冲；部署平台决策写入 02 §1.3 / §10（镜像本地实测通过，见 02 §10.3；**待部署到魔搭创空间后实测平台侧**） | — |
| ✅ | P0-07 | 主版本登记；（可选）CI 骨架：lint、typecheck、单测、集成测试（Postgres service） | 主版本写入 02 §1.4 | — (10-23) |

## P1 · C1 简历定制（M1）

**Schema 与表**

| 状态 | ID | 任务 | 验收标准 | 需求 | 学习点 |
|---|---|---|---|---|---|
| ✅ | P1-01 | Zod Schema：`Profile` / `Experience` / `Fact` / `Skill`、`JobTarget` / `Requirement`、`Resume`（每条 bullet `factRefs.min(1)`） | Schema 有单测；没有 factRefs 的 bullet 校验失败 | R-P1、R-C1-1、R-C1-4 | — (10-24) |
| ✅ | P1-02 | Drizzle 建表：profile / experience / fact（含 embedding）/ skill / job_target / job_requirement / resume / consent | 迁移成功；用户数据表都带 `user_id`，随 users 级联删除 | N-5、N-6 | — (10-24) |

**简历解析 → 职业档案**

| 状态 | ID | 任务 | 验收标准 | 需求 | 学习点 |
|---|---|---|---|---|---|
| ✅ | P1-03 | 上传前用途告知 + 单独同意（写入 `consents`，后端校验）；浏览器端 `unpdf` 提取文本；联系方式在前端规则抽取，不发给模型 | 未同意时不能上传；网络请求中只有文本，没有 PDF 文件 | N-2、N-4 | — (10-24) |
| ✅ | P1-04 | `extract` 图（profile）：脱敏 → 结构化抽取 → `ProfileDraft`；`POST /api/profile/extract`（不落库） | 输出通过 Zod 校验；发给模型的内容中没有手机号 / 邮箱 | R-P1、N-3 | 单节点图、结构化输出降级 (10-24) |
| ✅ | P1-05 | 档案确认 / 编辑页 + `GET / PUT /api/profile` | 用户校正后保存；数据按 `userId` 隔离 | R-P2、N-6 | — (10-24) |

**JD 解析与匹配**

| 状态 | ID | 任务 | 验收标准 | 需求 | 学习点 |
|---|---|---|---|---|---|
| ✅ | P1-06 | `extract` 图（job）+ `POST /api/jobs` + JD 输入页 | 输出通过 Zod 校验；页面可录入 JD | R-C1-1 | — (10-24) |
| ✅ | P1-07 | `domain.skillGap` + 匹配度与缺口展示 | skillGap 有单测；页面展示匹配度与缺口 | R-C1-2 | — (10-24) |

**事实检索与简历生成**

| 状态 | ID | 任务 | 验收标准 | 需求 | 学习点 |
|---|---|---|---|---|---|
| ✅ | P1-08 | 确定向量化模型与维度；pg-boss 进程内接入；`embed-facts` 任务；`FactRetriever`（强制 `userId`） | 保存档案后事实自动向量化；按 JD 要求召回相关事实；决策写入 02 §1.3 | R-C1-3 | Embeddings、`BaseRetriever` (10-24) |
| ✅ | P1-09 | `domain.factRefGuard`：引用无效或缺失的条目标记 `unverified` | 构造的编造用例被拦截 | R-C1-4 | — (10-24) |
| ✅ | P1-10 | `resume` 图：load → retrieve_facts → generate → guard → save | 用假模型的图测试覆盖 guard 分支 | R-C1-3、R-C1-4 | 多节点图、检索增强 (10-24) |
| ✅ | P1-11 | `POST /api/resumes/generate`（流式）+ 前端 `useObject` 预览 | 边生成边渲染；落库前后端全量校验 | R-C1-3、N-11 | 结构化流式 (10-24) |
| ✅ | P1-12 | 简历编辑 + 版本；打印模板 + `GET /api/resumes/:id/export` | 同一 JD 可有多个版本；打印为 PDF 排版正确；含 unverified 条目时返回 409 | R-C1-5、R-C1-6 | — (10-24) |

**题库准备**

| 状态 | ID | 任务 | 验收标准 | 需求 | 学习点 |
|---|---|---|---|---|---|
| ✅ | P1-13 | 题库规范：字段（02 §7.1）、技能标签体系（与 JD 技能点对齐）、难度分级、题型、来源与版权、JSONL 格式 | 规范写入 `db/seeds/questions/README.md`；P2a-02 可按规范录入 | R-C2-2 | — (10-24) |

## P2a · 题库检索 + C2 文字面试（M2a）

| 状态 | ID | 任务 | 验收标准 | 需求 | 学习点 |
|---|---|---|---|---|---|
| ⬜ | P2a-01 | Schema + 建表：`interview_sessions`（`mode`、`kind`、`settings`、`status`）/ `interview_turns`（`seq`、`idempotency_key` 唯一）/ `questions`（02 §7.1 全部字段与索引） | 迁移成功 | R-C2-6 | — |
| ⬜ | P2a-02 | 初版题库：前端岗位优先，≥200 题（后续扩充到数百题以上），按 P1-13 规范打标签；幂等 seed | 数据入库，标签覆盖初版 JD 技能点 | R-C2-2 | — |
| ⬜ | P2a-03 | `embed-questions` 任务：批量、可续跑、记录 `embed_model`；HNSW 索引 | 中断后再次运行只处理未完成的行 | R-C2-2 | 批量向量化 |
| ⬜ | P2a-04 | `QuestionRetriever`：结构化过滤 + 向量召回 +（可选）`pg_trgm` 关键词召回与 RRF 合并 +（可选）重排；`evals/retrieval` 小样本集计算 recall@k | recall@k 达到设定阈值；是否启用关键词召回与重排的决策写入 02 §1.3 | R-C2-2 | 混合检索、RRF、Rerank |
| ⬜ | P2a-05 | `domain.routeAfterEvaluate`、`domain.allocate`（短板优先、技能覆盖去重、难度梯度） | 追问上限、题目用尽、中止、短板优先等边界用例全部覆盖 | R-C2-3、R-C2-4 | — |
| ⬜ | P2a-06 | `interview` 图：plan_questions / ask / wait_answer / evaluate / finalize + 条件边 + `PostgresSaver` | 用 MemorySaver + 假模型的图测试覆盖：追问、下一题、结束、中途失败后续跑 | R-C2-2、R-C2-3 | 有环的图、条件边、`interrupt` 节点无副作用 |
| ⬜ | P2a-07 | 评估与追问 Prompt：`AnswerEvaluation { depth, needFollowUp, reason }`，最多 N 轮追问 | 浅回答触发追问；达到上限后进入下一题 | R-C2-3 | — |
| ⬜ | P2a-08 | 面试接口：`POST /api/interviews`、`POST /:id/chat`（advisory lock + 幂等 + 按 `state.next` 选择 resume 或续跑）、`GET /:id`、`POST /:id/finish` | 重复提交不会产生重复轮次；同一场面试的并发请求返回 409 | R-C2-6、N-9 | `getState`、`updateState` |
| ⬜ | P2a-09 | 面试设置页（岗位、题数、难度、风格）+ 对话页（`useChat` + `data-interview-state` 进度） | 设置生效；能完整走完一场面试 | R-C2-1、R-C2-2、N-11 | — |
| ⬜ | P2a-10 | 中断恢复验收：刷新、断网、进程重启、模型调用中途失败 | 各场景均可继续，回答不丢失 | R-C2-6、N-9 | 持久化执行 |

## P2b · C3 诊断（M2）

| 状态 | ID | 任务 | 验收标准 | 需求 | 学习点 |
|---|---|---|---|---|---|
| ⬜ | P2b-01 | Schema + 建表：`rubrics`（版本化）/ `diagnosis_reports`（`rubric_version`、`unique(session_id, rubric_version)`）/ `weaknesses` / `skill_score_history` | 迁移成功；**数据结构在本阶段定稿** | R-C3-1、R-C3-6 | — |
| ⬜ | P2b-02 | Rubric v1（技术深度 / 结构化表达 / 岗位匹配度 / 沟通流畅度）seed；`domain.aggregate` | Rubric 入库；aggregate 有单测 | R-C3-1、R-C3-6 | — |
| ⬜ | P2b-03 | `diagnosis` 图：load → `Send` 并行逐题打分 → aggregate → extract_weaknesses（附证据原话）→ plan_training → persist（单事务） | 输出通过 Zod 校验；每个短板都有证据；中途失败后从断点续跑 | R-C3-1、R-C3-2、R-C3-4 | `Send`、Reducer、map-reduce |
| ⬜ | P2b-04 | `diagnose` 任务：finalize 入队、pg-boss 重试、`POST /api/reports/:id/retry` | 面试结束不阻塞页面；同一 session 不会重复诊断；最终失败可手动重试 | N-9、N-11 | — |
| ⬜ | P2b-05 | 诊断报告页：雷达图 + 逐题点评 + 改进建议 + Rubric 版本（轮询生成状态） | 页面完整展示 | R-C3-3、R-C3-6 | — |
| ⬜ | P2b-06 | 主链路集成测试：`app.request()` + 真实 Postgres + 假模型，覆盖“档案 → JD → 简历 → 面试 → 报告” | `pnpm test:integration` 通过 | — | 假模型测试 |

## P3 · 复训闭环 + 用量 + PII 脱敏（M3）

| 状态 | ID | 任务 | 验收标准 | 需求 | 学习点 |
|---|---|---|---|---|---|
| ⬜ | P3-01 | 短板写回档案（`domain.merge`：合并 / 去重 / 更新严重度与状态） | merge 有单测；档案中能看到短板 | R-P3 | — |
| ⬜ | P3-02 | 复训计划在报告页展示 | 报告页展示复训计划 | R-C3-4 | — |
| ⬜ | P3-03 | `plan_questions` 读取历史短板（`tools.getOpenWeaknesses`），检索与分配优先命中短板 | 第二场面试的题目命中短板 | R-C2-4 | 工具从 config 取 `userId` |
| ⬜ | P3-04 | 专项训练：`POST /api/training { weaknessId }`，报告页一键进入 | 只针对该短板出题 | R-C2-5 | — |
| ⬜ | P3-05 | 成长曲线：`GET /api/growth` + 图表 | 展示同一技能多次诊断的得分趋势 | R-C3-5 | — |
| ⬜ | P3-06 | 长期记忆评估：是否启用 LangGraph `PostgresStore` 存“面试洞察” | 决策写入 02 §1.3；启用时纳入一键删除 | R-P3 | Store、命名空间 |
| ⬜ | P3-07 | PII 脱敏：`llm/redact` 覆盖发送给模型、写日志的全部路径 | 用含手机号 / 邮箱 / 证件号的简历和回答测试，模型请求与日志中没有明文 PII | N-3 | — |
| ⬜ | P3-08 | 用量与成本：`llm/pricing`、`GET /api/usage/sessions/:id`、单场 Token 上限 | 能查看单场 Token 与成本；超限返回 `BUDGET_EXCEEDED` | N-12 | — |
| ⬜ | P3-09 | 韧性与故障注入：超时 / 重试 / fallback；前端按错误码提示 | 模拟模型失败时有提示，且数据不丢 | N-9 | `withFallbacks` |

## P4 · 语音面试（M4）

| 状态 | ID | 任务 | 验收标准 | 需求 | 学习点 |
|---|---|---|---|---|---|
| ⬜ | P4-01 | 语音方案调研：ASR / TTS / 实时语音 provider 的效果、延迟、价格、免费额度 | 决策写入 02 §1.3 | R-C2-7 | — |
| ⬜ | P4-02 | `VoiceProvider` 端口 + 注册表别名 `MODEL_ASR` / `MODEL_TTS` | 切换语音 provider 只改环境变量 | N-7 | — |
| ⬜ | P4-03 | 半双工语音面试：按住录音 → `POST /api/voice/transcribe` → 复用 `chat` 用例 → `POST /api/voice/tts` 播放 | 可以语音一问一答；语音与文字共用同一张面试图 | R-C2-7、R-C2-10 | — |
| ⬜ | P4-04 | 打断（用户开始说话时停止播放）与断线恢复（复用 `GET /api/interviews/:id`） | 打断后能正确回应；重连后状态一致 | R-C2-6、R-C2-8 | — |
| ⬜ | P4-05 | 语音 UI：波形、计时、字幕 | 体验完整 | R-C2-9 | — |
| ⬜ | P4-06 | 转写入库复用诊断；Rubric v2 增加语音维度（语速、停顿、口头禅），通过一致性评测后上线 | 语音面试生成报告，标注 Rubric 版本 | R-C2-10、R-C3-1、R-C3-6 | — |
| ⬜ | P4-07 | （可选）实时双工：服务端 WebSocket 中转到实时语音模型（`MODEL_REALTIME`） | 延迟达到调研时设定的目标；密钥不出后端 | R-C2-7、N-7 | — |

## P5 · 评测与合规（M5）

**评测**

| 状态 | ID | 任务 | 验收标准 | 需求 | 学习点 |
|---|---|---|---|---|---|
| ⬜ | P5-01 | 评测集：简历生成、出题、诊断各 ≥20 条用例 | 用例入库（`evals/`） | N-10 | — |
| ⬜ | P5-02 | promptfoo 接入：自定义 provider 调用图；覆盖幻觉（factRef）与出题相关性；支持多个 provider 横向对比 | `pnpm eval` 可运行；用对比结果选定主力模型，写入 02 §1.3 | N-10 | LLM 评测 |
| ⬜ | P5-03 | 评分一致性评测（同一回答多次打分的方差） | 方差在阈值内 | R-C3-6、N-10 | — |
| ⬜ | P5-04 | 偏见检查：Rubric 与 Prompt 不使用受保护特征 | `evals/bias` 用例通过 | N-8 | — |

**合规与数据**

| 状态 | ID | 任务 | 验收标准 | 需求 | 学习点 |
|---|---|---|---|---|---|
| ⬜ | P5-05 | 一键删除（02 §8.4：业务数据、LangGraph 存档、Store、队列、Cookie、墓碑） | 删除后 DB 中没有残留（含 `langgraph.*`、`pgboss.*`） | N-5 | `deleteThread` |
| ⬜ | P5-06 | 隐私说明页：用途、日志与备份保留期、所用模型 provider 及是否出境 | 说明页可访问；同意流程引用当前说明版本 | N-4、N-5 | — |
| ⬜ | P5-07 | AI 生成内容标识：面试、简历、报告页面 | 页面有标识 | N-14 | — |
| ⬜ | P5-08 | 备份与恢复演练：从 `pg_dump` 恢复并按 `deletion_tombstones` 重放删除 | 演练记录写入 `deploy/README.md` | N-5 | — |

---

## 3. 待补项（优先级低，按需启动）

| 状态 | ID | 事项 | 触发条件 | 内容 | 需求 |
|---|---|---|---|---|---|
| ⬜ | B-01 | **正式鉴权** | 对外开放前必须完成 | Better Auth + Drizzle 适配器（邮箱 + 密码）、`ALLOW_SIGNUP`、`auth` 中间件替换 `devUser`、登录页与路由守卫、会话吊销、登录限流、越权回归用例 | R-A-1、N-6 |
| ⬜ | B-02 | 按用户限流与额度 | B-01 完成后 | 限流维度由 IP 改为用户 + IP；按用户的每日 Token 额度 | N-12 |
| ⬜ | B-03 | 对外开放前合规评估 | 对外开放前 | `ALLOWED_PROVIDERS` 收紧为国内已备案模型；数据境内；AI 内容标识范围确认 | N-13、N-14 |
| ⬜ | B-04 | E2E 测试 | 页面稳定后 | Playwright 主链路（假模型） | — |
| ⬜ | B-05 | MCP Server | 学习需要时 | 把题库检索封装为 MCP Server，供外部 Agent 使用 | — |
| ⬜ | B-06 | 外部 Trace | 学习需要时 | 本地自建 Langfuse，仅用测试数据 | — |
| ⬜ | B-07 | 子图重构 | 学习需要时 | 把“出题”抽成子图，供普通面试与专项训练复用 | — |

## 4. 决策点汇总

各阶段需要产出的决策（技术类结论统一写入 02 §1.3）：

| 阶段 | 任务 | 决策事项 |
|---|---|---|
| P0 | P0-04 | 流式适配：`@ai-sdk/langchain` / 自写 SSE |
| P0 | P0-06 | 部署平台：魔搭 / 自有机器 / 轻量服务器 |
| P0 | P0-07 | 依赖主版本登记 |
| P1 | P1-08 | 向量化模型与维度 |
| P2a | P2a-04 | 是否启用关键词召回与重排 |
| P3 | P3-06 | 是否启用 LangGraph Store |
| P4 | P4-01 | 语音方案；是否做实时双工 |
| P5 | P5-02 | 主力模型（按评测结果） |

## 变更记录

| 日期 | 变更 |
|---|---|
| 2026-10-22 | 初版任务清单（65 项） |
| 2026-10-23 | 按前后端分离架构重整：新增归属列与需求映射列；P0 扩展为 15 项；合计 73 项 |
| 2026-10-23 | 修订：P0 精简为 9 项；新增 P1-00 最小鉴权、P1-16 题库负责人、P2b-07 worker 部署、P2b-09 E2E；PII 脱敏由 P5 移到 P3（P3-10）；P2 拆成 P2a / P2b；§1 补团队规模（前端 1 + 后端 1）与工期表；需求编号对齐 01 修订版；合计 72 项 |
| 2026-10-23 | **重写**：对齐 02 重写版（个人项目、单进程、LangGraph.js、模型注册表、pgvector 混合检索、魔搭部署）。投入改为 1 人、按人日估算；去掉归属列，新增学习点列；鉴权移入待补项（B-01）；合计 60 项 + 7 项待补 |
| 2026-10-24 | P1（C1 简历定制）完成：同意 → 本地抽文本 → 抽取图 → 确认档案 → 向量化 → JD 匹配 → 简历图（检索 + guard）→ 流式预览 → 版本与打印。题库只写规范，不导入题目。P0-03 / P0-06 仍待真实 Key 与魔搭实测 |

### 本次重写的主要调整

| 调整 | 说明 |
|---|---|
| 删除的任务 | 契约生成与 MSW、CODEOWNERS、同源转发与代理凭证、Next.js 中间件、独立 worker 部署、Langfuse 接入、编排器选型（已定 LangGraph.js）、记忆框架选型 |
| 新增的任务 | 模型注册表与能力表（P0-03）、最小 LangGraph 图验证（P0-04）、魔搭单镜像与 `accessGate`（P0-06）、事实检索（P1-08）、题库向量化与混合检索（P2a-03、P2a-04）、中断恢复验收（P2a-10）、用量与成本（P3-08）、备份恢复演练（P5-08） |
| 前移 | 上传前单独同意由 P5 前移到 P1-03（实现简单，且上传功能依赖它） |
| 后移 | 正式鉴权（原 P1-00）→ 待补项 B-01；E2E（原 P2b-09）→ B-04，主链路改由集成测试覆盖（P2b-06） |
| 题库规模 | 初版 ≥200 题，后续扩充到数百题以上，因此向量检索从 P2a 起就是必需项 |
| 语音 | 先做半双工（P4-03），实时双工改为可选（P4-07） |
