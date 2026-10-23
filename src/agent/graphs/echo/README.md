# graphs/echo/ —— 回声图（P0 样板）

```text
START → ask → wait_answer(interrupt) → reply ─┬→ ask     （round < maxRounds）
                                              └→ finish → END
```

| 文件 | 说明 |
|---|---|
| `state.ts` | messages（追加）/ round / maxRounds / status |
| `graph.ts` | 节点实现与边；路由判断调 `@/shared/domain/dev/echo-route` |

用途：验证 interrupt / Command 恢复、PostgresSaver 跨进程恢复、逐字流式、用量入库、失败续跑。未来面试图（02 §6.4）在此基础上增加 plan_questions、evaluate、finalize。
调用方：`backend/core/dev.service.ts`；前端页面：`frontend/routes/dev-echo.tsx`。
