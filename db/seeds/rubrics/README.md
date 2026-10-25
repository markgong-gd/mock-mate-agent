# db/seeds/rubrics/ —— 评分标准（Rubric）

一个 `*.json` 一个版本，文件名就是版本号（`v1.json` → `version: "v1"`）。
`pnpm db:seed` 按 `rubricSeedSchema`（`src/shared/schemas/rubric.ts`）校验后 upsert 进 `rubrics` 表。

```json
{
  "active": true,
  "definition": {
    "version": "v1",
    "title": "…",
    "notes": ["…"],
    "dimensions": [
      { "key": "tech_depth", "label": "技术深度", "description": "…", "weight": 0.4,
        "anchors": [{ "score": 1, "text": "…" }, { "score": 3, "text": "…" }, { "score": 5, "text": "…" }] }
    ]
  }
}
```

| 字段 | 约束 |
|---|---|
| `version` | 形如 `v1`，与文件名一致；主键 |
| `active` | 只允许一个文件为 `true`；新建报告默认用它 |
| `dimensions[].key` | 取自 `RUBRIC_DIMENSIONS` 枚举（加维度要先改枚举） |
| `dimensions[].weight` | 各维度之和必须为 1 |
| `dimensions[].anchors` | 2–5 条，`score` 在 1–5 之间；会原样写进打分 Prompt |
| `notes` | 展示在报告页，必须包含反偏见声明（N-8） |

## 改 Rubric 的规矩（R-C3-6）

- **不要原地改已上线的版本**：已生成的报告记录了 `rubric_version`，改定义会让历史报告解释不通。
- 新建 `v2.json`，把 `v1.json` 的 `active` 改成 `false`，再 `pnpm db:seed`。
- 新版本要先通过评分一致性评测（P5-03）才能置为 `active`。
- 维度不得使用受保护特征（性别、年龄、婚育、民族、口音、院校等），偏见回归见 `evals/bias`（P5-04）。
- 语音维度（语速、停顿、口头禅）留到 P4-06 的 v2。
