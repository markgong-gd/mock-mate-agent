# features/dev-echo/ —— 回声图

`queries.ts`：useEchoThread(threadId) → GET /api/dev/echo/:threadId，从后端 LangGraph 存档恢复历史消息与进度。被 `routes/dev-echo.tsx` 使用。
