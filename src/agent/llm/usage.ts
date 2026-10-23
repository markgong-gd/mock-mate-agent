/**
 * @file 【智能体·llm】用量回调
 * 做什么：UsageCallbackHandler（LangChain 回调）在每次模型调用结束时产出 LlmCallRecord（只有元数据）。
 * 注意：写库的 sink 由 backend/core/usage.ts 注入，本层不依赖 db。
 */
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { Serialized } from '@langchain/core/load/serializable';
import type { BaseMessage } from '@langchain/core/messages';
import type { LLMResult } from '@langchain/core/outputs';
import { logger } from '@/shared/common/logger';
import { META_KEYS } from './registry';

/** llm_calls 一行：只有元数据，不含 Prompt 与输出正文（02 §5.6） */
export interface LlmCallRecord {
  userId: string;
  sessionId?: string | null;
  requestId?: string | null;
  functionId: string;
  promptVersion?: string | null;
  alias?: string | null;
  provider: string;
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  latencyMs: number;
  firstTokenMs?: number | null;
  status: 'ok' | 'error';
  errorType?: string | null;
}

export type UsageSink = (record: LlmCallRecord) => Promise<void> | void;

export interface UsageContext {
  userId: string;
  requestId?: string;
  sessionId?: string;
}

interface RunInfo {
  start: number;
  firstTokenAt?: number;
  metadata: Record<string, unknown>;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

function extractUsage(output: LLMResult): { input?: number; output?: number } {
  const gen = output.generations?.[0]?.[0] as { message?: BaseMessage } | undefined;
  const um = (
    gen?.message as { usage_metadata?: { input_tokens?: number; output_tokens?: number } } | undefined
  )?.usage_metadata;
  if (um) return { input: num(um.input_tokens), output: num(um.output_tokens) };
  const tu = (output.llmOutput?.tokenUsage ?? output.llmOutput?.estimatedTokenUsage) as
    { promptTokens?: number; completionTokens?: number } | undefined;
  return { input: num(tu?.promptTokens), output: num(tu?.completionTokens) };
}

/**
 * LangChain 回调 → llm_calls。
 * functionId 优先取调用 metadata.functionId；图节点内未显式指定时用 `graph:<节点名>`。
 */
export class UsageCallbackHandler extends BaseCallbackHandler {
  name = 'mockmate-usage';
  private readonly runs = new Map<string, RunInfo>();

  constructor(
    private readonly ctx: UsageContext,
    private readonly sink: UsageSink,
  ) {
    super();
  }

  override handleChatModelStart(
    _llm: Serialized,
    _messages: BaseMessage[][],
    runId: string,
    _parentRunId?: string,
    _extraParams?: Record<string, unknown>,
    _tags?: string[],
    metadata?: Record<string, unknown>,
  ) {
    this.runs.set(runId, { start: Date.now(), metadata: metadata ?? {} });
  }

  override handleLLMNewToken(_token: string, _idx: unknown, runId: string) {
    const r = this.runs.get(runId);
    if (r && r.firstTokenAt === undefined) r.firstTokenAt = Date.now();
  }

  override async handleLLMEnd(output: LLMResult, runId: string) {
    const usage = extractUsage(output);
    await this.finish(runId, { status: 'ok', inputTokens: usage.input, outputTokens: usage.output });
  }

  override async handleLLMError(err: unknown, runId: string) {
    await this.finish(runId, { status: 'error', errorType: err instanceof Error ? err.name : 'Error' });
  }

  private async finish(
    runId: string,
    r: Pick<LlmCallRecord, 'status' | 'inputTokens' | 'outputTokens' | 'errorType'>,
  ) {
    const run = this.runs.get(runId);
    if (!run) return;
    this.runs.delete(runId);
    const md = run.metadata;
    const node = str(md.langgraph_node);
    const record: LlmCallRecord = {
      userId: this.ctx.userId,
      requestId: this.ctx.requestId ?? null,
      sessionId: this.ctx.sessionId ?? str(md.sessionId) ?? str(md.thread_id) ?? null,
      functionId: str(md.functionId) ?? (node ? `graph:${node}` : 'unknown'),
      promptVersion: str(md.promptVersion) ?? null,
      alias: str(md[META_KEYS.alias]) ?? null,
      provider: str(md[META_KEYS.provider]) ?? str(md.ls_provider) ?? 'unknown',
      model: str(md[META_KEYS.modelId]) ?? str(md.ls_model_name) ?? 'unknown',
      latencyMs: Date.now() - run.start,
      firstTokenMs: run.firstTokenAt ? run.firstTokenAt - run.start : null,
      inputTokens: r.inputTokens ?? null,
      outputTokens: r.outputTokens ?? null,
      status: r.status,
      errorType: r.errorType ?? null,
    };
    try {
      await this.sink(record);
    } catch (err) {
      logger.error({ err, functionId: record.functionId }, 'failed to record llm call');
    }
  }
}
