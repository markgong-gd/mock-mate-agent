# shared/env/ —— 环境变量

| 文件 | 谁能用 | 说明 |
|---|---|---|
| `load.ts` | 后端 | 读取 `.env` 到 process.env（后端入口第一行 import） |
| `server.ts` | 后端 | Zod 解析全部服务端配置；**密钥只在这里读取**；serverEnv() 带缓存 |
| `client.ts` | 前端 | 只解析 `VITE_*` 非敏感变量 |

**新增配置**：在 `server.ts` 的 schema 中加字段 → 同步 `.env.example`。
