# db/ —— 迁移与种子数据

| 路径 | 说明 |
|---|---|
| `migrations/` | drizzle-kit 生成的 SQL；`0000` 启用 vector / pg_trgm，`0001` 建 users / llm_calls；`meta/` 自动维护勿手改 |
| `seeds/questions/` | 题库 JSONL（P2a） |
| `seeds/rubrics/` | 评分标准（P2b） |

表结构的源头在 `src/backend/db/schema`：改 schema → `pnpm db:generate` → `pnpm db:migrate`。

迁移的执行过程、幂等机制（`drizzle.__drizzle_migrations`）、何时需要重跑、以及不迁移直接 `pnpm dev` 的后果，见根 [README 「数据库迁移」](../README.md#数据库迁移pnpm-dbmigrate)。
