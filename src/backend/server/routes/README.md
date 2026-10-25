# server/routes/ —— 路由

| 文件 | 接口 |
|---|---|
| `health.ts` | GET /api/healthz、GET /api/readyz |
| `meta.ts` | GET /api/meta |
| `access.ts` | /api/access/status、login、logout |
| `llm.ts` | GET /api/llm/ping?alias= |
| `dev.ts` | /api/dev/*（回声图、存档查看、Mermaid、POST /faults 故障注入；仅 ENABLE_DEV_ROUTES 时开放） |
| `consents.ts` | GET /api/consents/resume-parse、POST /api/consents |
| `profile.ts` | GET/PUT /api/profile、POST /api/profile/extract |
| `jobs.ts` | GET/POST /api/jobs、GET /api/jobs/:id |
| `resumes.ts` | 列表、流式生成、读取、另存版本、导出 |
| `interviews.ts` | 创建文字面试、流式 chat、读取进度、主动结束 |
| `training.ts` | POST /api/training：按报告里的一条短板开专项训练（返回会话摘要，之后走 interviews） |
| `reports.ts` | GET /api/reports（可带 ?sessionId=）、GET /api/reports/:id、POST /api/reports/:id/retry |
| `growth.ts` | GET /api/growth：技能得分趋势 + 总分趋势 |
| `usage.ts` | GET /api/usage/sessions/:id：单场 Token、耗时与估算成本 |

以后：privacy / voice。
**规则**：不写业务逻辑；只 import `@/backend/core/*`、`@/shared/*`。
新增路由要在 `app.ts` 的 `apiRoutes` 里**链式** `.route()`，否则前端 `hc<AppType>` 推不出类型。
