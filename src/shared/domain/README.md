# shared/domain/ —— 纯函数业务规则

**零 IO、零三方 SDK、只依赖 shared/schemas**（ESLint 强制）。不跑图、不调模型、不连数据库也能单测。

| 路径 | 说明 |
|---|---|
| `dev/echo-route.ts` | 回声图 reply 之后走 ask 还是 finish |
| `matching/skill-gap.ts` | 档案技能标签和 JD 要求的命中率、缺口。精确标签，不用向量 |
| `resume/fact-ref-guard.ts` | 引用不在允许集合里的 bullet 标成 unverified |
| `retrieval/overlap.ts` | 向量召回为空时，用词面重叠挑事实，保证 Prompt 里有真实 id |

还没写（02 §3）：
- `interview/route.ts`：评估后 follow_up / next / finish
- `interview/allocate.ts`：出题分配（短板优先、技能覆盖、难度梯度）
- `diagnosis/aggregate.ts`：维度分 / 总分聚合
- `weakness/merge.ts`：短板合并
