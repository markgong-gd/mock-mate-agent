# agent/graphs/ —— LangGraph 编排

| 路径 | 说明 |
|---|---|
| `checkpointer.ts` | PostgresSaver 单例（langgraph schema）：每步状态落库 → 可 interrupt、可跨进程恢复 |
| `config.ts` | GraphConfigurable { thread_id, userId, requestId } 与 getGraphCtx() |
| `stream.ts` | graphToUIStream：LangGraph 流 → AI SDK UI Message Stream（前端 useChat 可直接消费） |
| [echo/](echo/) | P0 回声图：ask → wait_answer(interrupt) → reply → ask / finish。挂 PostgresSaver，给以后的面试图当样板 |
| [extract/](extract/) | 单节点抽取图。profile 和 job 各一张，不挂 checkpointer：失败就整次重试 |
| [resume/](resume/) | load → retrieve_facts → generate → guard → save。一次请求内跑完，失败不留半成品 |
| [interview/](interview/) | plan_questions → ask → wait_answer(interrupt) → evaluate → 追问 / 下一题 / finalize。挂 PostgresSaver |
| [diagnosis/](diagnosis/) | load → Send 并行 score_answer → aggregate → extract_weaknesses → plan_training → persist。挂 PostgresSaver（thread = `diag:<reportId>`），由 pg-boss 在后台跑 |

**一张图的标准结构**：

```text
<图名>/
├── state.ts      Annotation.Root 状态 + reducer
├── graph.ts      addNode / addEdge / addConditionalEdges(调 shared/domain) / compile({ checkpointer })
└── nodes/*.ts    节点较多时拆出
```

**map-reduce（diagnosis）**：条件边返回 `Send[]` 扇出；并行节点用 `addNode(key, fn, { input: XxxState })` 声明自己的入参结构，
入参字段名不能和主状态重名（同名 channel 的类型必须完全一致）；结果汇总靠主状态里的追加型 reducer。

**被谁调用**：`backend/core/*.service.ts` 构建图实例（注入 checkpointer），调用 `graph.stream / getState`。
