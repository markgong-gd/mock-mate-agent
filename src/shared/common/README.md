# shared/common/ —— 公共工具

| 文件 | 谁能用 | 说明 |
|---|---|---|
| `ctx.ts` | 后端 / 智能体 | RequestCtx { userId, requestId }：身份在各层间传递的唯一方式 |
| `errors.ts` | **前后端共用** | 错误码、HTTP 状态、文案、AppError；不得引入 Node API |
| `ids.ts` | 后端 | newId()、hashUserId() |
| `logger.ts` | 后端 | pino 根 logger；不记录正文与明文 PII |
