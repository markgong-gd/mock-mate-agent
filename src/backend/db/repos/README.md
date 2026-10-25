# db/repos/ —— 仓储

| 文件 | 函数 |
|---|---|
| `users.ts` | ensureUser |
| `llm-calls.ts` | insertLlmCall、listRecentLlmCalls |
| `profile.ts` | 整份读写档案；列出待向量化的事实 |
| `jobs.ts` | 写入和读取目标岗位 |
| `resumes.ts` | 追加版本（事务里取 max+1）、按用户读取 |
| `consents.ts` | 记录同意、判断当前文案版本是否已同意 |

**规则**：每个读写用户数据的方法都必须接收 `userId` 并写入 where 条件（数据隔离）。
