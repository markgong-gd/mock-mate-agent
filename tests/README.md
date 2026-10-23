# tests/ —— 测试

| 路径 | 说明 |
|---|---|
| `helpers/env.ts` | 测试工具：useTestEnv（fake 模型配置）、readAll（读完整条流） |
| `integration/` | 集成测试：真实 Postgres + 假模型（`pnpm test:integration`） |

单元测试与源码放在同一目录（`src/**/*.test.ts`），用 `pnpm test` 运行，不依赖数据库。
