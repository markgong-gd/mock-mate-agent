# deploy/ —— 部署

| 路径 | 说明 |
|---|---|
| `modelscope/entrypoint.sh` | 魔搭单镜像启动脚本：初始化并启动内置 Postgres（数据在 /mnt/workspace）→ 启动 Node → SIGTERM 时先停 Node 再停 PG |

平台相关差异只允许出现在 `backend/server/entry.ts`、`shared/env`、`Dockerfile`、`deploy/` 中。详见 docs/02 §10。
