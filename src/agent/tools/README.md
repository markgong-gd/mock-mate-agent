# agent/tools/ —— 只读工具

给图节点（以及以后给模型自己）调用的**只读**查询，不写库、不改状态。

| 文件 | 说明 |
|---|---|
| `weaknesses.ts` | `getOpenWeaknesses(config)` 读该用户未解决的短板（open + improving），按 tag 去重；`openWeaknessesTool` 是同一逻辑的 LangChain 工具包装 |

**铁律：身份从 `config.configurable.userId` 取，不做成工具入参。**
工具的入参有可能由模型填，一旦 `userId` 出现在 schema 里，Prompt 注入就能读到别人的数据（N-6）。
所以这里只 import `agent/graphs/config.ts` 的 `getGraphCtx`（ESLint 只开了这一个文件的口子）。

去重与状态流转的规则在 `shared/domain/weakness/merge.ts`，这里不重复实现。
