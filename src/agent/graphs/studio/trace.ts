/**
 * @file 【智能体·graphs】策划运行记录
 * 把观察、模型调用、思考和规则的输入输出写成步骤。只通过 custom 流交给页面，不写日志。
 */
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { Serialized } from '@langchain/core/load/serializable';
import type { BaseMessage } from '@langchain/core/messages';
import type { LLMResult } from '@langchain/core/outputs';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { META_KEYS } from '@/agent/llm/registry';
import type { StudioTraceStep } from '@/shared/schemas/studio';

const TEXT_MAX = 16_000;

export function clip(text: string, max = TEXT_MAX): string {
  if (text.length <= max) return text;
  const suffix = `\n…（已截断，原文 ${text.length} 字）`;
  return `${text.slice(0, Math.max(0, max - suffix.length))}${suffix}`;
}

export function jsonText(value: unknown): string {
  return clip(JSON.stringify(value, null, 2) ?? '');
}

export function messageText(message: BaseMessage | undefined): string {
  if (!message) return '';
  if (typeof message.content === 'string') return message.content;
  return message.content
    .map((part) =>
      typeof part === 'object' && 'text' in part && typeof part.text === 'string' ? part.text : '',
    )
    .join('');
}

export function formatMessages(messages: BaseMessage[]): string {
  return clip(messages.map((message) => `[${message.getType()}]\n${messageText(message)}`).join('\n\n'));
}

/** 从模型消息里拆思维链。没有就返回空字符串 */
export function reasoningOf(message: BaseMessage | undefined): string {
  if (!message) return '';
  const extra = message.additional_kwargs as { reasoning_content?: unknown } | undefined;
  const parts: string[] = [];
  if (typeof extra?.reasoning_content === 'string' && extra.reasoning_content.trim()) {
    parts.push(extra.reasoning_content.trim());
  }
  const content = message.content;
  if (typeof content === 'string') {
    const think = /<think>([\s\S]*?)<\/think>/i.exec(content);
    if (think?.[1]?.trim()) parts.push(think[1].trim());
  } else {
    for (const part of content) {
      if (typeof part !== 'object' || part == null || !('type' in part)) continue;
      if (part.type !== 'thinking' && part.type !== 'reasoning') continue;
      const text =
        'thinking' in part && typeof part.thinking === 'string'
          ? part.thinking
          : 'text' in part && typeof part.text === 'string'
            ? part.text
            : '';
      if (text.trim()) parts.push(text.trim());
    }
  }
  return parts.join('\n\n');
}

export function usageOf(message: BaseMessage | undefined): { input: number | null; output: number | null } {
  const usage = (
    message as { usage_metadata?: { input_tokens?: number; output_tokens?: number } } | undefined
  )?.usage_metadata;
  return {
    input: typeof usage?.input_tokens === 'number' ? usage.input_tokens : null,
    output: typeof usage?.output_tokens === 'number' ? usage.output_tokens : null,
  };
}

const str = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined);

export interface StudioModelStart {
  alias: string;
  provider: string;
  model: string;
  method?: string;
  functionId: string;
  promptVersion: string;
  input: string;
}

export interface StudioModelReport extends StudioModelStart {
  status: 'ok' | 'error';
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  attempts: number;
  output: string;
  reasoning: string;
  note?: string;
}

/** 挂在结构化调用上，记下真正发给模型的消息、token 和思维链 */
export class StudioModelCapture extends BaseCallbackHandler {
  name = 'studio-model-capture';
  attempts = 0;
  input = '';
  rawText = '';
  reasoning = '';
  inputTokens: number | null = null;
  outputTokens: number | null = null;
  alias = '';
  provider = '';
  model = '';
  method = '';
  private readonly seenModels: string[] = [];

  override handleChatModelStart(
    _llm: Serialized,
    messages: BaseMessage[][],
    _runId: string,
    _parentRunId?: string,
    _extraParams?: Record<string, unknown>,
    _tags?: string[],
    metadata?: Record<string, unknown>,
  ) {
    const flat = messages[0] ?? [];
    this.input = formatMessages(flat);
    this.alias = str(metadata?.[META_KEYS.alias]) ?? this.alias;
    this.provider = str(metadata?.[META_KEYS.provider]) ?? this.provider;
    this.method = str(metadata?.structuredMethod) ?? this.method;
    const model = str(metadata?.[META_KEYS.modelId]);
    if (model) {
      this.model = model;
      this.seenModels.push(model);
    }
  }

  override handleLLMEnd(output: LLMResult) {
    this.attempts += 1;
    this.addUsage(output);
    const generation = output.generations?.[0]?.[0] as { message?: BaseMessage; text?: string } | undefined;
    this.rawText = generation?.text || messageText(generation?.message);
    const reasoning = reasoningOf(generation?.message);
    if (reasoning) this.reasoning = reasoning;
  }

  override handleLLMError() {
    this.attempts += 1;
  }

  fallbackNote(): string | undefined {
    const unique = [...new Set(this.seenModels)];
    if (unique.length < 2) return undefined;
    return `主模型失败后改用 ${unique.at(-1)}。`;
  }

  private addUsage(output: LLMResult) {
    const generation = output.generations?.[0]?.[0] as { message?: BaseMessage } | undefined;
    const usage = usageOf(generation?.message);
    if (usage.input != null) this.inputTokens = (this.inputTokens ?? 0) + usage.input;
    if (usage.output != null) this.outputTokens = (this.outputTokens ?? 0) + usage.output;
  }
}

type StepDraft = Omit<StudioTraceStep, 'id' | 'seq' | 'at'>;

export interface StudioTracer {
  /** 先发出进行中的一步，调用结束再 complete 同一 id */
  begin(draft: StepDraft): string;
  patch(id: string, draft: Partial<StepDraft>): void;
  complete(id: string, draft: Partial<StepDraft>): void;
  add(draft: StepDraft): StudioTraceStep;
  /** 节点成功时写进状态的步骤。进行中的不在里面 */
  finished(): StudioTraceStep[];
}

export function createStudioTracer(config: LangGraphRunnableConfig, startSeq: number): StudioTracer {
  const done: StudioTraceStep[] = [];
  const pending = new Map<string, StudioTraceStep>();
  let seq = startSeq;

  const publish = (step: StudioTraceStep) => {
    config.writer?.({ type: 'studio-trace', step });
  };

  const materialize = (draft: StepDraft, id: string, seqNo: number): StudioTraceStep => ({
    ...draft,
    id,
    seq: seqNo,
    at: new Date().toISOString(),
    ...(draft.input ? { input: clip(draft.input) } : {}),
    ...(draft.output ? { output: clip(draft.output) } : {}),
    ...(draft.note ? { note: clip(draft.note, 500) } : {}),
  });

  return {
    begin(draft) {
      const id = crypto.randomUUID();
      const step = materialize({ ...draft, status: 'running' }, id, seq);
      seq += 1;
      pending.set(id, step);
      publish(step);
      return id;
    },
    patch(id, draft) {
      const prev = pending.get(id);
      if (!prev || prev.status !== 'running') return;
      const step = materialize({ ...prev, ...draft, status: 'running' }, id, prev.seq);
      pending.set(id, step);
      publish(step);
    },
    complete(id, draft) {
      const prev = pending.get(id);
      if (!prev) return;
      pending.delete(id);
      const step = materialize({ ...prev, ...draft }, id, prev.seq);
      publish(step);
      if (step.status !== 'running') done.push(step);
    },
    add(draft) {
      const step = materialize(draft, crypto.randomUUID(), seq);
      seq += 1;
      publish(step);
      if (step.status !== 'running') done.push(step);
      return step;
    },
    finished: () => done,
  };
}

export function nextTraceSeq(traces: StudioTraceStep[] | undefined): number {
  return (traces?.at(-1)?.seq ?? -1) + 1;
}

export function errorNote(error: unknown): string {
  const message = error instanceof Error ? error.message : '这一步失败了';
  return clip(message, 300);
}
