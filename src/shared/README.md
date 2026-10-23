# src/shared/ —— 公共底座

被前端、后端、智能体共同依赖的最底层代码。

| 子目录 | 说明 | 谁能用 |
|---|---|---|
| [domain/](domain/) | 纯函数业务规则（零 IO、零三方 SDK） | backend、agent |
| `schemas/`（P1 起） | Zod 领域定义：领域对象 / LLM 结构化输出 / API 入参的唯一来源 | 全部 |
| [env/](env/) | 环境变量：`server.ts` 仅后端，`client.ts` 仅前端 | 见文件 |
| [common/](common/) | ctx、错误码、id、日志 | `errors.ts` 前后端共用，其它仅后端 |

**规则**：shared 不得依赖 frontend / backend / agent。
