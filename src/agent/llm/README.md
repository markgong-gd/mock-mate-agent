# agent/llm/ —— 模型网关

业务代码只认**别名**（chat / judge / extract / fallback），provider 与模型由 `.env` 决定：

```text
.env: MODEL_CHAT=deepseek:deepseek-chat
        │
registry.getChatModel('chat') ──> providers.createChatModel(kind) ──> LangChain 模型实例
        │                                 openai-compatible | deepseek | ollama | fake | dg-custom
        ├── caps.ts       能力表 → 结构化输出方式
        ├── resilience.ts getChatRunnable：带 MODEL_FALLBACK 兜底（图节点用）
        ├── structured.ts generateStructured：Zod 校验 + 修复重试 + fallback
        ├── redact.ts     发给模型前脱敏（规则在 shared/common/pii.ts）
        ├── pricing.ts    provider:model → 单价，成本现算
        └── usage.ts      UsageCallbackHandler → （core 注入的 sink）→ llm_calls
```

| 文件 | 说明 |
|---|---|
| `providers.ts` | kind → 模型类工厂；新增 provider 类型只改这里 |
| `registry.ts` | 别名解析、缓存、启动校验 |
| `caps.ts` | 模型能力表（可用 MODEL_CAPS_* 覆盖） |
| `fake.ts` | 离线假模型（无 Key 可跑通全链路）；`injectFakeFaults(n)` 做故障注入 |
| `resilience.ts` | fallback、超时（统一套 `LLM_TIMEOUT_MS`）、错误归一为 LLM_* |
| `structured.ts` | 结构化输出 |
| `usage.ts` | 用量回调（不含正文） |
| `redact.ts` | 发给模型前盖住手机号、邮箱、18 位证件号。规则本体在 `shared/common/pii.ts`，日志出口共用同一套 |
| `pricing.ts` | `provider:model` → 单价（元 / 百万 token）。**成本不落库**，读接口现算；单价没配返回 `null` 而不是 0 |
| `embeddings.ts` | 向量模型。fake 时用 n-gram 哈希，维度和列一样是 1024 |
| `fake-structured.ts` | 假模型看到 `TASK:` 时拼出能通过 Zod 的 JSON |

**规则**：不依赖 backend/db（写库的 sink、成本查询都在 `backend/core`）。

**用量回调的代价**：`handleLLMEnd` 里会 `await` 一次写库，等于把一次 DB 往返放进了模型调用链。
并行分支（诊断的 `Send` 打分）里有一个分支快速失败时，其它还在途中的分支会被一起中止，
它们的 putWrites 落不下来，重跑时会多打一两题——分数按唯一键 upsert，不会叠加。
