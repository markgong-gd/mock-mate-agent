# agent/prompts/ —— Prompt

| 文件 | 说明 |
|---|---|
| `dev-echo.ts` | 回声图的 system prompt |

**约定**：每个 Prompt 文件导出 `*_PROMPT_VERSION`（如 `'dev-echo@1'`），节点调用时写入 metadata，最终记录到 `llm_calls.prompt_version`，便于评测与回溯。修改 Prompt 时同步升级版本号。
