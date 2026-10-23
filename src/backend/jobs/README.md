# src/backend/jobs/ —— 后台任务（pg-boss，进程内消费）

| 文件 | 说明 |
|---|---|
| `index.ts` | registerJobs(boss)：注册全部队列，由 core/runtime 启动时调用 |
| `backup.ts` | backup 队列：按 BACKUP_CRON 调 core/backup.service |

未来：`diagnose.ts`（面试结束后异步诊断）、`embed-questions.ts`、`embed-facts.ts`。
**规则**：handler 只调 `@/backend/core/*`，不直接写业务逻辑。
