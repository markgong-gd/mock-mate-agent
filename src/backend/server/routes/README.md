# server/routes/ —— 路由

| 文件 | 接口 |
|---|---|
| `health.ts` | GET /api/healthz、GET /api/readyz |
| `meta.ts` | GET /api/meta |
| `access.ts` | /api/access/status、login、logout |
| `llm.ts` | GET /api/llm/ping?alias= |
| `dev.ts` | /api/dev/*（回声图、存档查看、Mermaid；仅 ENABLE_DEV_ROUTES 时开放） |
| `consents.ts` | GET /api/consents/resume-parse、POST /api/consents |
| `profile.ts` | GET/PUT /api/profile、POST /api/profile/extract |
| `jobs.ts` | GET/POST /api/jobs、GET /api/jobs/:id |
| `resumes.ts` | 列表、流式生成、读取、另存版本、导出 |
| `interviews.ts` | 创建文字面试、流式 chat、读取进度、主动结束 |

以后：reports / training / growth / usage / privacy / voice。
**规则**：不写业务逻辑；只 import `@/backend/core/*`、`@/shared/*`。
