# db/schema/ —— 表结构

| 文件 | 表 |
|---|---|
| `users.ts` | users：用户根表，其它用户表经 user_id 外键级联删除 |
| `llm-calls.ts` | llm_calls：模型调用用量元数据（不存正文） |
| `index.ts` | 汇总导出（drizzle-kit 从这里读取） |

**新增表**：新建 `<领域>.ts` → 在 `index.ts` 中 `export *`。所有用户数据表都要有 `user_id` 且 `ON DELETE CASCADE`。
