# src/backend/core/ —— 用例层

后端的"大脑"：把 db、agent、jobs 串成完整的业务流程。

| 文件 | 说明 |
|---|---|
| `runtime.ts` | 进程启动 / 停机（注册表校验、迁移、存档表、pg-boss） |
| `dev.service.ts` | 回声图用例：start / resume / continue 判断 → 调图 → 转流；存档恢复；调试 |
| `llm.service.ts` | 模型别名列表、Ping |
| `health.service.ts` | 就绪检查 |
| `usage.ts` | 组装用量回调：agent/llm 的 handler + db 的写库函数 |
| `usage.service.ts` | 单场用量聚合、成本现算（agent/llm/pricing）、单场 Token 上限（`BUDGET_EXCEEDED`） |
| `backup.service.ts` | pg_dump 备份 |
| `interview.service.ts` | 文字面试：创建、加锁、先写回答、推进图、结束 |
| `studio.service.ts` | 简历策划：创建、加锁、先写原话、推进图、导出稿、删除 |
| `training.service.ts` | 专项训练：按报告里的一条短板建 `kind = drill` 的会话，之后复用面试链路 |
| `diagnosis.service.ts` | C3 诊断：幂等建档 + 入队、跑诊断图、报告视图、手动重试 |
| `growth.service.ts` | 成长曲线：技能得分历史分组 + 总分折线 |
| `profile.service.ts` | 职业档案：抽取草稿、确认入库、读档案（含写回的短板） |
| `question-embed.service.ts` | 题库向量化，可重复跑 |
| `seed-cli.ts` | `pnpm db:seed` |

**放什么**：每个业务一个 `<领域>.service.ts`，函数签名 `fn(ctx: RequestCtx, input)`。
**职责**：权限、事务、幂等、加锁、调图、入队、写库。
**不放什么**：HTTP 细节（属于 server）、纯规则判断（属于 shared/domain）、模型调用细节（属于 agent/llm）。

`core` 不允许依赖 `agent/tools`：工具是给图和模型用的。`core` 需要同样的数据时直接走 `db/repos` + `shared/domain`。
