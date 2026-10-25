# agent/prompts/ —— Prompt

| 文件 | 说明 |
|---|---|
| `dev-echo.ts` | 回声图的 system prompt，版本 `dev-echo@1` |
| `extract-profile.ts` | 档案抽取，版本 `profile-extract@1`。第一行 `TASK:` 给假模型分流 |
| `extract-job.ts` | JD 抽取，版本 `job-extract@1` |
| `resume.ts` | 定制简历，版本 `resume@1`。factRefs 只能填 Prompt 里给出的 id |

**约定**：每个 Prompt 文件导出 `*_PROMPT_VERSION`（如 `'dev-echo@1'`），节点调用时写入 metadata，最终记录到 `llm_calls.prompt_version`，便于评测与回溯。修改 Prompt 时同步升级版本号。
