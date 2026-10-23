# src/backend/server/ —— HTTP 层

| 路径 | 说明 |
|---|---|
| `entry.ts` | 进程入口：校验 env → startRuntime → createApp → 静态托管（生产）→ 监听 → 优雅停机 |
| `app.ts` | Hono 装配：中间件链 + /api 路由；**导出 `type AppType` 供前端使用** |
| `types.ts` | `AppEnv`、`toCtx(c)` |
| `validate.ts` | zod 校验封装（失败抛 VALIDATION） |
| [middleware/](middleware/) | requestId → accessGate → devUser；error；rateLimit |
| [routes/](routes/) | 各领域路由 |

**路由写法三步**：`validate(入参)` → `core.xxx(toCtx(c), input)` → `c.json()` 或流式 Response。
**新增路由**：`routes/<领域>.ts` 导出 `new Hono<AppEnv>().get(...)`，在 `app.ts` 的 `apiRoutes` 中链式 `.route()` 注册（必须链式，前端才能推导类型）。
