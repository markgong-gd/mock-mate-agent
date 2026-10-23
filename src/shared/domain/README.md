# shared/domain/ —— 纯函数业务规则

**零 IO、零三方 SDK、只依赖 shared/schemas**（ESLint 强制）。不跑图、不调模型、不连数据库也能单测。

| 路径 | 说明 |
|---|---|
| `dev/echo-route.ts` | 回声图 reply 之后走 ask 还是 finish |

未来（02 §3）：
- `interview/route.ts`：评估后 follow_up / next / finish
- `interview/allocate.ts`：出题分配（短板优先、技能覆盖、难度梯度）
- `resume/fact-ref-guard.ts`：简历条目事实溯源校验
- `diagnosis/aggregate.ts`：维度分 / 总分聚合
- `weakness/merge.ts`：短板合并
- `matching/skill-gap.ts`：JD 技能缺口
