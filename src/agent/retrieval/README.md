# agent/retrieval/ —— 向量检索

| 文件 | 说明 |
|---|---|
| `fact-retriever.ts` | 按 JD 要求召回当前用户的事实。userId 在构造时注入 |

SQL 在 `backend/db/vector.ts`。这里只负责“用哪段文本去查、查谁的数据”。

**取舍**：继承 LangChain `BaseRetriever`，是为了以后图里可以把检索器当 Runnable。真正用的是 `retrieve()`，因为它保留事实 id 和分数；`Document` 会把这些塞进 metadata，调用时容易漏。
