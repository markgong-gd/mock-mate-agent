# studio/ —— 对话式简历策划图

```text
START → coach → speak → wait_user(interrupt) → coach
```

| 文件 | 说明 |
|---|---|
| `state.ts` | 当前稿、目标岗位、用户原话、焦点栏目、是否可以导出 |
| `graph.ts` | coach 出结构化提案，domain 决定能不能改，speak 把定稿的话说出来 |
| `trace.ts` | 把观察、模型、思考和规则的输入输出写成步骤，推给页面并留在状态里 |
| `graph.test.ts` | 追问、按原话改稿、拒绝编造、失败后续跑 |

挂 PostgresSaver，`thread_id` 就是 `studio_sessions.id`。`wait_user` 不写库。简历稿在 coach 里落库，所以预览事件发出时库里已经是新稿。
