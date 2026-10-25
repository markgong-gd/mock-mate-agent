# shared/schemas/ —— 领域对象的唯一定义

Zod schema 是档案、JD、简历、同意、题库种子的类型来源。API 入参、LLM 结构化输出、前端表单都引用这里，避免各写一套。

| 文件 | 内容 |
|---|---|
| `skill-tags.ts` | 封闭技能目录。简历、JD、题库必须用同一套 tag |
| `profile.ts` | 模型输出的档案草稿（无 id、无联系方式）和用户确认后的档案 |
| `job.ts` | JD 抽取结果与落库后的岗位 |
| `resume.ts` | 简历内容。每条 bullet 的 `factRefs` 至少 1 个 |
| `consent.ts` | 简历解析同意的目的与版本 |
| `question.ts` | 题库种子、检索结果、进入面试图的题目 |
| `interview.ts` | 面试设置、评估结果、进度和接口入参 |
| `embedding.ts` | 向量维度 1024 |

**不放什么**：数据库列定义（在 `backend/db/schema`）、业务流程（在 `backend/core`）。

**取舍**：模型输出和落库形状分成两个 schema。模型不分配 UUID、不接触联系方式，id 由服务端在返回草稿时补上。好处是溯源 id 稳定、PII 不进模型；代价是确认页要同时拿着“草稿”和“本地抽到的联系方式”。
