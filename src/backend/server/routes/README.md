# server/routes/ —— 路由

| 文件 | 接口 |
|---|---|
| `health.ts` | GET /api/healthz、GET /api/readyz |
| `meta.ts` | GET /api/meta |
| `access.ts` | /api/access/status、login、logout |
| `llm.ts` | GET /api/llm/ping?alias= |
| `dev.ts` | /api/dev/*（回声图、存档查看、Mermaid；仅 ENABLE_DEV_ROUTES 时开放） |

未来：profile / jobs / resumes / interviews / reports / training / growth / usage / privacy / voice。
**规则**：不写业务逻辑；只 import `@/backend/core/*`、`@/shared/*`。
