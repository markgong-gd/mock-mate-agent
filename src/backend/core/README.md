# src/backend/core/ —— 用例层

后端的"大脑"：把 db、agent、jobs 串成完整的业务流程。

| 文件 | 说明 |
|---|---|
| `runtime.ts` | 进程启动 / 停机（注册表校验、迁移、存档表、pg-boss） |
| `dev.service.ts` | 回声图用例：start / resume / continue 判断 → 调图 → 转流；存档恢复；调试 |
| `llm.service.ts` | 模型别名列表、Ping |
| `health.service.ts` | 就绪检查 |
| `usage.ts` | 组装用量回调：agent/llm 的 handler + db 的写库函数 |
| `backup.service.ts` | pg_dump 备份 |

**放什么**：每个业务一个 `<领域>.service.ts`，函数签名 `fn(ctx: RequestCtx, input)`。
**职责**：权限、事务、幂等、加锁、调图、入队、写库。
**不放什么**：HTTP 细节（属于 server）、纯规则判断（属于 shared/domain）、模型调用细节（属于 agent/llm）。
