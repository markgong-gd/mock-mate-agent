# resume/ —— 简历内容的纯规则

| 文件 | 说明 |
|---|---|
| `fact-ref-guard.ts` | 对照允许的事实 id，把无效引用标成 unverified |

导出是否放行不在这里决定（那是用例层看 `hasUnverified` 后返回 409），这里只负责标注。
