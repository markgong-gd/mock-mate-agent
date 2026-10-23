# db/repos/ —— 仓储

| 文件 | 函数 |
|---|---|
| `users.ts` | ensureUser |
| `llm-calls.ts` | insertLlmCall、listRecentLlmCalls |

**规则**：每个读写用户数据的方法都必须接收 `userId` 并写入 where 条件（数据隔离）。
