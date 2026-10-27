# shared/domain/ —— 纯函数业务规则

**零 IO、零三方 SDK、只依赖 shared/schemas**（ESLint 强制）。不跑图、不调模型、不连数据库也能单测。

| 路径 | 说明 |
|---|---|
| `dev/echo-route.ts` | 回声图 reply 之后走 ask 还是 finish |
| `matching/skill-gap.ts` | 档案技能标签和 JD 要求的命中率、缺口。精确标签，不用向量 |
| `resume/fact-ref-guard.ts` | 引用不在允许集合里的 bullet 标成 unverified |
| `resume/standard.ts` | 简历标准 `resume-standard@1`：技能是否越界、数字是否丢失等。只出检查结果，不改正文 |
| `retrieval/overlap.ts` | 向量召回为空时，用词面重叠挑事实或题目 |
| `retrieval/rrf.ts` | 多路召回的倒数排名融合 |
| `retrieval/recall.ts` | recall@k，给检索小样本用 |
| `interview/route.ts` | 评估后 follow_up / next / finish |
| `interview/allocate.ts` | 出题：短板优先、技能覆盖、难度梯度 |
| `diagnosis/aggregate.ts` | 维度分 / 总分 / 技能分聚合 |
| `weakness/merge.ts` | 短板写回档案：按 tag 去重、严重度取较大值、状态流转（open / improving / closed） |

**为什么 merge 在这里而不是在 repo 里**：`backend/db` 不允许依赖 `shared/domain`。
诊断图算好 `statusChanges` 再交给 `saveDiagnosis` 写，规则和 SQL 分开，规则可以脱库单测。
同一个函数还被"读档案短板"复用（只传 `existing`），保证页面和出题看到的是同一套口径。
