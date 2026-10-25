# extract/ —— 单节点抽取图

| 文件 | 说明 |
|---|---|
| `graph.ts` | `extract-profile` 与 `extract-job`。一个节点，调用 `generateStructured` |

不挂 checkpointer：没有中断，失败就整次重试。脱敏在进图之前做完，节点只看见已经替换过手机号和邮箱的文本。
