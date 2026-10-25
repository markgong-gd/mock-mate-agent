# db/repos/ —— 仓储

| 文件 | 函数 |
|---|---|
| `users.ts` | ensureUser |
| `llm-calls.ts` | insertLlmCall、listRecentLlmCalls、sumSessionUsage、sumSessionTokens |
| `profile.ts` | 整份读写档案；列出待向量化的事实 |
| `jobs.ts` | 写入和读取目标岗位 |
| `resumes.ts` | 追加版本（事务里取 max+1）、按用户读取 |
| `consents.ts` | 记录同意、判断当前文案版本是否已同意 |
| `questions.ts` | 按 id 批量读题、题库 upsert 与向量回写 |
| `interviews.ts` | 会话（含 `kind = drill`）与轮次；seq 在事务里取 max+1 |
| `diagnosis.ts` | Rubric、报告（幂等建档）、短板（按报告 / 按用户）、技能得分历史、`saveDiagnosis` 单事务 |

**规则**
- 每个读写用户数据的方法都必须接收 `userId` 并写入 where 条件（数据隔离）。
- 这一层**不做规则判断**：`backend/db` 不允许依赖 `shared/domain`。
  例如"短板该标 closed 还是 improving"由诊断图算出 `weaknessStatusChanges` 再传给 `saveDiagnosis`。
- 聚合只到数据层面（token、次数、耗时）；换算成钱在 `backend/core/usage.service.ts`，因为单价会变。
