# src/backend/jobs/ —— 后台任务（pg-boss，进程内消费）

| 文件 | 说明 |
|---|---|
| `index.ts` | registerJobs(boss)：注册全部队列，由 core/runtime 启动时调用 |
| `backup.ts` | backup 队列：按 BACKUP_CRON 调 core/backup.service |
| `embed-facts.ts` | embed-facts 队列：保存档案后按用户向量化，handler 只调 `embedFactsForUser` |
| `embed-questions.ts` | embed-questions 队列：补题库向量，handler 只调 `embedQuestions` |
| `boss.ts` | 进程里的 pg-boss 实例。core 入队时用它，避免 jobs 和 embed 服务循环引用 |

以后：`diagnose.ts`（面试结束后异步诊断，P2b）。
**规则**：handler 只调 `@/backend/core/*`，不直接写业务逻辑。
