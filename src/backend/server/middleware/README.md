# server/middleware/ —— 中间件

执行顺序（见 `../app.ts`）：`requestId` → `accessGate` → `devUser` → 路由；异常统一由 `error` 处理。

| 文件 | 说明 |
|---|---|
| `request-id.ts` | 生成 / 透传 X-Request-Id，挂请求级 logger，记录访问日志 |
| `access-gate.ts` | 公网访问口令（签名 httpOnly Cookie）；未配置口令时不生效 |
| `dev-user.ts` | 单用户模式：注入 DEV_USER_ID（未来替换为正式鉴权） |
| `rate-limit.ts` | 进程内存固定窗口限流（按路由按需挂载） |
| `error.ts` | 统一错误契约 `{ code, message, requestId, details? }` + 404 |
