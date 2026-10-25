# src/frontend/lib/ —— 前端基础设施

| 文件 | 说明 |
|---|---|
| `api.ts` | `hc<AppType>` 类型安全客户端；`unwrap()` 解包响应；`ApiClientError`；`parseStreamError()` |
| `chat-transport.ts` | `useChat` 的 transport：只把本轮 `{ answer }` 发给后端（历史以后端存档为准） |
| `utils.ts` | `cn()`：合并 className |
| `contact.ts` | 从粘贴文本里抽出手机号和邮箱，去掉后再发给抽取接口 |
| `pdf-text.ts` | 浏览器里用 unpdf 抽 PDF 文本。网络请求里只有文本，没有文件 |
