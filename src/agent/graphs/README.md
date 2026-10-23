# agent/graphs/ —— LangGraph 编排

| 路径 | 说明 |
|---|---|
| `checkpointer.ts` | PostgresSaver 单例（langgraph schema）：每步状态落库 → 可 interrupt、可跨进程恢复 |
| `config.ts` | GraphConfigurable { thread_id, userId, requestId } 与 getGraphCtx() |
| `stream.ts` | graphToUIStream：LangGraph 流 → AI SDK UI Message Stream（前端 useChat 可直接消费） |
| [echo/](echo/) | P0 回声图：ask → wait_answer(interrupt) → reply → ask / finish |

**一张图的标准结构**（未来 interview / diagnosis / resume / extract 照此）：

```text
<图名>/
├── state.ts      Annotation.Root 状态 + reducer
├── graph.ts      addNode / addEdge / addConditionalEdges(调 shared/domain) / compile({ checkpointer })
└── nodes/*.ts    节点较多时拆出
```

**被谁调用**：`backend/core/*.service.ts` 构建图实例（注入 checkpointer），调用 `graph.stream / getState`。
