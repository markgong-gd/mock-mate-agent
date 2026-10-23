# src/agent/ —— 智能体

AI 相关代码，**运行在后端进程内**，由 `backend/core` 调用（不是独立服务）。

| 子目录 | 状态 | 职责 |
|---|---|---|
| [graphs/](graphs/) | 已有 | LangGraph 图：状态、节点、边、存档、流式转换 |
| [llm/](llm/) | 已有 | 模型网关：注册表、provider、能力表、降级、结构化输出、用量 |
| [prompts/](prompts/) | 已有 | 带版本号的 Prompt |
| `tools/` | P1 起 | LLM 可调用的**只读**工具（userId 从 config 取） |
| `retrieval/` | P1 起 | QuestionRetriever / FactRetriever（pgvector） |
| `rubrics/` | P2b 起 | 评分标准定义 |
| `voice/` | P4 起 | ASR / TTS 适配 |

**关键约定**
1. 节点内调模型统一走 `agent/llm`（别名 chat / judge / extract / fallback），不直接 new 模型。
2. 条件边的判断写在 `@/shared/domain` 纯函数中，图只负责调用。
3. `interrupt()` 单独放在无副作用的节点里（恢复时该节点会重跑）。
4. userId / requestId 通过 `config.configurable` 注入，不作为 LLM 可见参数。
5. 工具只读；写库只发生在确定性节点或 backend/core 中。
6. `agent/llm` 不依赖 `backend/db`（用量写库的 sink 由 core 注入）。

完整代码地图见 [docs/04-code-map.md](../../docs/04-code-map.md)。
