# agent/llm/ —— 模型网关

业务代码只认**别名**（chat / judge / extract / fallback），provider 与模型由 `.env` 决定：

```text
.env: MODEL_CHAT=deepseek:deepseek-chat
        │
registry.getChatModel('chat') ──> providers.createChatModel(kind) ──> LangChain 模型实例
        │                                 openai-compatible | deepseek | ollama | fake
        ├── caps.ts       能力表 → 结构化输出方式
        ├── resilience.ts getChatRunnable：带 MODEL_FALLBACK 兜底（图节点用）
        ├── structured.ts generateStructured：Zod 校验 + 修复重试 + fallback
        └── usage.ts      UsageCallbackHandler → （core 注入的 sink）→ llm_calls
```

| 文件 | 说明 |
|---|---|
| `providers.ts` | kind → 模型类工厂；新增 provider 类型只改这里 |
| `registry.ts` | 别名解析、缓存、启动校验 |
| `caps.ts` | 模型能力表（可用 MODEL_CAPS_* 覆盖） |
| `fake.ts` | 离线假模型（无 Key 可跑通全链路） |
| `resilience.ts` | fallback、超时、错误归一为 LLM_* |
| `structured.ts` | 结构化输出 |
| `usage.ts` | 用量回调（不含正文） |
| `redact.ts` | 发给模型前盖住手机号、邮箱、18 位证件号。目前接在抽取图上；日志和其他入口是 P3-07 |
| `embeddings.ts` | 向量模型。fake 时用 n-gram 哈希，维度和列一样是 1024 |
| `fake-structured.ts` | 假模型看到 `TASK:` 时拼出能通过 Zod 的 JSON |

以后：`pricing.ts`（单价）。**规则**：不依赖 backend/db。
