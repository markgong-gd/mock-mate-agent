# db/schema/ —— 表结构

| 文件 | 表 |
|---|---|
| `users.ts` | users：用户根表，其它用户表经 user_id 外键级联删除 |
| `llm-calls.ts` | llm_calls：模型调用用量元数据（不存正文） |
| `profile.ts` | profiles / experiences / facts / skills。facts.embedding 可空，向量后补 |
| `job.ts` | job_targets / job_requirements |
| `resume.ts` | resumes：同一岗位按 version 追加，正文是 jsonb |
| `consent.ts` | consents：用途 + 文案版本，换版本要重新同意 |
| `question.ts` | questions：全局题库。HNSW、技能 GIN、search_text 的 trgm GIN。没有 user_id |
| `interview.ts` | interview_sessions / interview_turns。轮次按 seq 唯一，幂等键是部分唯一索引 |
| `index.ts` | 汇总导出（drizzle-kit 从这里读取） |

**新增表**：新建 `<领域>.ts` → 在 `index.ts` 中 `export *`。所有用户数据表都要有 `user_id` 且 `ON DELETE CASCADE`。
