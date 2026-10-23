# src/frontend/lib/ —— 前端基础设施

| 文件 | 说明 |
|---|---|
| `api.ts` | `hc<AppType>` 类型安全客户端；`unwrap()` 解包响应；`ApiClientError`；`parseStreamError()` |
| `chat-transport.ts` | `useChat` 的 transport：只把本轮 `{ answer }` 发给后端（历史以后端存档为准） |
| `utils.ts` | `cn()`：合并 className |

未来：`pdf-text.ts`（浏览器端用 unpdf 提取简历文本，原文件不上传）。
