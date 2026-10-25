# db/ —— 迁移与种子数据

| 路径 | 说明 |
|---|---|
| `migrations/` | drizzle-kit 生成的 SQL；`0000` 启用 vector / pg_trgm，`0001` 建 users / llm_calls，`0003` 建题库和面试表，`0004` 建 rubrics / diagnosis_reports / weaknesses / skill_score_history；`meta/` 自动维护勿手改 |
| `seeds/questions/` | 题库规范、`frontend.jsonl`（216 题）和生成脚本 `build-bank.mjs` |
| [`seeds/rubrics/`](seeds/rubrics/) | 评分标准（Rubric），一个 JSON 一个版本 |

表结构的源头在 `src/backend/db/schema`：改 schema → `pnpm db:generate` → `pnpm db:migrate`。

`pnpm db:seed` 依次导入评分标准和题库，再补算题目向量；两步都是幂等的，可以重复执行。

迁移的执行过程、幂等机制（`drizzle.__drizzle_migrations`）、何时需要重跑、以及不迁移直接 `pnpm dev` 的后果，见根 [README 「数据库迁移」](../README.md#数据库迁移pnpm-dbmigrate)。
