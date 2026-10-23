# src/backend/ —— 后端

运行在 Node 进程中（tsup 打包 → `dist/server`）。请求的处理方向是 **server → core → db / jobs / agent**。

| 子目录 | 职责 | 一句话 |
|---|---|---|
| [server/](server/) | HTTP 层 | 中间件 + 路由 + 进程启动；只做"解析入参 → 调 core → 返回"，不写业务 |
| [core/](core/) | 用例层 | 权限、事务、幂等、加锁、调图、入队、写库；后端的"大脑" |
| [db/](db/) | 数据访问 | Drizzle 表结构、仓储（强制 userId）、迁移、连接池 |
| [jobs/](jobs/) | 后台任务 | pg-boss 队列 / 定时任务；handler 只调 core |

**规则**：除 `server/` 外不得依赖 `hono` / `react`；身份只经 `RequestCtx` 传递。

完整代码地图见 [docs/04-code-map.md](../../docs/04-code-map.md)。
