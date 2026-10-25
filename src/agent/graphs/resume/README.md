# resume/ —— 定制简历图

```text
START → load → retrieve_facts → generate → guard → save → END
```

| 文件 | 说明 |
|---|---|
| `state.ts` | 档案、岗位、召回事实、草稿、校验后内容、新版本 id |
| `graph.ts` | 五个节点。guard 调用 `factRefGuard`，不调用模型 |
| `graph.test.ts` | 用注入的生成函数覆盖 verified / unverified 两条分支 |

不挂 checkpointer。和面试图不同：这里没有“等用户回答”的中断，失败时保留的是数据库里的上一版，不是图的半截状态。

**取舍**：检索是提示，guard 的允许集合就是放进 Prompt 的那些事实 id。模型没看见的真实事实也不能引用——否则它只能是猜的。向量召回为空时，先用词面重合，再不行就把已有事实都放进 Prompt，避免离线演示没有 id 可用。
