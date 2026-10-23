/**
 * @file 【智能体·llm】结构化输出
 * 做什么：generateStructured(alias, zodSchema, messages) —— 按能力选择输出方式 → Zod 校验 →
 *        携带校验错误修复重试 1 次 → 仍失败切 fallback → 最终抛 LLM_SCHEMA_INVALID。P1 的抽取 / 评估会用到。
 */
import type { Callbacks } from '@langchain/core/callbacks/manager';
import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { AppError } from '@/shared/common/errors';
import { pickStructuredMethod, type StructuredMethod } from './caps';
import type { ChatAlias, ResolvedChatModel } from './registry';
import { withFallback } from './resilience';

export interface CallMeta {
  functionId: string;
  promptVersion: string;
  sessionId?: string;
}

export interface StructuredCallOptions {
  signal?: AbortSignal;
  callbacks?: Callbacks;
}

const messageText = (m: BaseMessage | undefined): string => {
  if (!m) return '';
  if (typeof m.content === 'string') return m.content;
  return m.content
    .map((p) => (typeof p === 'object' && 'text' in p && typeof p.text === 'string' ? p.text : ''))
    .join('');
};

/** 从模型文本中提取 JSON：剥离思考内容与代码块，截取最外层对象 / 数组 */
export function extractJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  let s = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  if (fence?.[1]) s = fence[1].trim();
  const start = s.search(/[[{]/);
  if (start < 0) return { ok: false, error: '输出中没有 JSON' };
  const open = s[start];
  const end = s.lastIndexOf(open === '{' ? '}' : ']');
  if (end <= start) return { ok: false, error: 'JSON 不完整' };
  try {
    return { ok: true, value: JSON.parse(s.slice(start, end + 1)) };
  } catch (e) {
    return { ok: false, error: `JSON 解析失败：${(e as Error).message}` };
  }
}

function formatInstructions(schema: z.ZodType): string {
  const jsonSchema = JSON.stringify(z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }));
  return [
    '只输出一个 JSON 对象，不要输出任何解释、Markdown 或代码块标记。',
    `JSON 必须符合以下 JSON Schema：${jsonSchema}`,
  ].join('\n');
}

const formatIssues = (issues: z.core.$ZodIssue[]) =>
  issues.slice(0, 10).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);

interface Attempt {
  rawText: string;
  candidate: unknown;
  parseError?: string;
}

async function invokeOnce(
  m: ResolvedChatModel,
  method: StructuredMethod,
  schema: z.ZodType,
  messages: BaseMessage[],
  config: Record<string, unknown>,
): Promise<Attempt> {
  if (method === 'jsonSchema' || method === 'functionCalling') {
    const runnable = m.model.withStructuredOutput(schema as z.ZodType<Record<string, unknown>>, {
      method,
      includeRaw: true,
      name: 'output',
    });
    const res = (await runnable.invoke(messages, config)) as { raw: BaseMessage; parsed: unknown };
    if (res.parsed != null) return { rawText: JSON.stringify(res.parsed), candidate: res.parsed };
    const toolArgs = (res.raw as AIMessage).tool_calls?.[0]?.args;
    if (toolArgs) return { rawText: JSON.stringify(toolArgs), candidate: toolArgs };
    const text = messageText(res.raw);
    const ex = extractJson(text);
    return ex.ok
      ? { rawText: text, candidate: ex.value }
      : { rawText: text, candidate: undefined, parseError: ex.error };
  }
  const model = method === 'jsonMode' && m.jsonModeOptions ? m.model.withConfig(m.jsonModeOptions) : m.model;
  const out = await model.invoke(messages, config);
  const text = messageText(out);
  const ex = extractJson(text);
  return ex.ok
    ? { rawText: text, candidate: ex.value }
    : { rawText: text, candidate: undefined, parseError: ex.error };
}

/**
 * 用指定模型生成结构化输出：按能力选择方式 → Zod 校验 → 携带校验错误修复重试 1 次（02 §5.2）。
 * 仍失败抛 AppError(LLM_SCHEMA_INVALID)。
 */
export async function generateStructuredWith<T extends z.ZodType>(
  m: ResolvedChatModel,
  schema: T,
  messages: BaseMessage[],
  meta: CallMeta,
  opts: StructuredCallOptions = {},
): Promise<z.infer<T>> {
  const method = pickStructuredMethod(m.caps);
  const config = {
    signal: opts.signal,
    callbacks: opts.callbacks,
    runName: meta.functionId,
    metadata: { functionId: meta.functionId, promptVersion: meta.promptVersion, sessionId: meta.sessionId },
  };
  let convo =
    method === 'jsonMode' || method === 'prompt'
      ? [new SystemMessage(formatInstructions(schema)), ...messages]
      : messages;

  let lastIssues: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const a = await invokeOnce(m, method, schema, convo, config);
    if (a.parseError === undefined) {
      const r = schema.safeParse(a.candidate);
      if (r.success) return r.data;
      lastIssues = formatIssues(r.error.issues);
    } else {
      lastIssues = [a.parseError];
    }
    convo = [
      ...convo,
      new AIMessage(a.rawText || '(空输出)'),
      new HumanMessage(
        `上面的输出没有通过校验：\n- ${lastIssues.join('\n- ')}\n请修正后重新输出完整的 JSON，只输出 JSON。`,
      ),
    ];
  }
  throw new AppError('LLM_SCHEMA_INVALID', undefined, {
    details: { functionId: meta.functionId, model: m.id, method, issues: lastIssues },
  });
}

/** 业务入口：按别名生成结构化输出，失败时切 fallback 再试一次 */
export function generateStructured<T extends z.ZodType>(
  alias: ChatAlias,
  schema: T,
  messages: BaseMessage[],
  meta: CallMeta,
  opts: StructuredCallOptions = {},
): Promise<z.infer<T>> {
  return withFallback(alias, (m) => generateStructuredWith(m, schema, messages, meta, opts), opts);
}
