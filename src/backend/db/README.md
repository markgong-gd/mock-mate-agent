# src/backend/db/ —— 数据访问

| 路径 | 说明 |
|---|---|
| `client.ts` | 唯一的 pg.Pool（Drizzle 与 LangGraph PostgresSaver 共用）、getDb / pingDb / closePool |
| `migrate.ts` | 持 advisory lock 执行 `db/migrations` |
| `migrate-cli.ts` | `pnpm db:migrate` 入口 |
| [schema/](schema/) | Drizzle 表定义 |
| [repos/](repos/) | 查询函数（强制 userId） |

**变更表结构**：改 `schema/*.ts` → `pnpm db:generate` → `pnpm db:migrate`。
迁移执行过程与排查见根 [README 「数据库迁移」](../../../README.md#数据库迁移pnpm-dbmigrate)；`MIGRATE_ON_START=true` 时由 `core/runtime.ts` 在启动阶段调用 `runMigrations()`。
未来：`vector.ts`（pgvector 向量 / 混合检索 SQL）。
