# shared/common/ —— 公共工具

| 文件 | 谁能用 | 说明 |
|---|---|---|
| `ctx.ts` | 后端 / 智能体 | RequestCtx { userId, requestId }：身份在各层间传递的唯一方式 |
| `errors.ts` | **前后端共用** | 错误码、HTTP 状态、文案、AppError；不得引入 Node API |
| `ids.ts` | 后端 | newId()、hashUserId() |
| `pii.ts` | **前后端共用** | 手机号 / 邮箱 / 证件号的脱敏规则 + `redactPiiDeep`；零依赖 |
| `logger.ts` | 后端 | pino 根 logger；不记录正文与明文 PII |

**为什么 PII 规则在 common 而不在 `agent/llm`**：脱敏有两个出口——发给模型和写日志。
`logger.ts` 属于本目录（不允许依赖 `agent`），所以规则下沉到这里，上面各包一层：
`agent/llm/redact.ts` 给模型入口用，`logger.ts` 的 `hooks.logMethod` + `formatters.log` 给日志兜底。
日志的兜底是"机器保障"，不代表可以往日志里塞原文——约定仍然是只记元数据。
