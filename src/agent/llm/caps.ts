/**
 * @file 【智能体·llm】模型能力表
 * 做什么：记录各模型是否支持 jsonSchema / tools / jsonMode / reasoning 等，并据此选择结构化输出方式；可用 MODEL_CAPS_* 覆盖。
 */
import type { ProviderKind } from '@/shared/env/server';

/** 模型能力（02 §5.2） */
export interface ModelCaps {
  /** 支持严格 JSON Schema 输出 */
  jsonSchema: boolean;
  /** 支持工具调用 */
  tools: boolean;
  /** 支持 JSON mode */
  jsonMode: boolean;
  /** 推理模型（输出含思考内容；不用于低延迟 judge） */
  reasoning: boolean;
  /** 上下文长度 */
  contextWindow: number;
}

/** 未知模型的保守默认值：只走 Prompt 约束 + 提取 JSON */
export const DEFAULT_CAPS: ModelCaps = {
  jsonSchema: false,
  tools: false,
  jsonMode: false,
  reasoning: false,
  contextWindow: 32_000,
};

type CapsRule = { kind?: ProviderKind; match: RegExp; caps: Partial<ModelCaps> };

/**
 * 内置能力表：按顺序匹配，先命中先用。
 * 各家能力随版本变化，以官方文档为准；不确定时用 MODEL_CAPS_<ALIAS> 覆盖。
 */
const BUILTIN: CapsRule[] = [
  { kind: 'fake', match: /.*/, caps: {} },
  { kind: 'ollama', match: /.*/, caps: { jsonSchema: true, jsonMode: true, contextWindow: 8_000 } },
  { match: /^deepseek-reasoner/, caps: { jsonMode: true, reasoning: true, contextWindow: 128_000 } },
  { match: /^deepseek-/, caps: { tools: true, jsonMode: true, contextWindow: 128_000 } },
  { match: /^glm-z1/, caps: { jsonMode: true, reasoning: true, contextWindow: 32_000 } },
  { match: /^glm-/, caps: { tools: true, jsonMode: true, contextWindow: 128_000 } },
  { match: /^(qwq|qwen3?-.*thinking)/, caps: { reasoning: true, contextWindow: 128_000 } },
  { match: /^qwen/, caps: { tools: true, jsonMode: true, contextWindow: 128_000 } },
  {
    match: /^(gpt-4o|gpt-4\.1|gpt-5)/,
    caps: { jsonSchema: true, tools: true, jsonMode: true, contextWindow: 128_000 },
  },
  {
    match: /^(o\d)/,
    caps: { jsonSchema: true, tools: true, jsonMode: true, reasoning: true, contextWindow: 128_000 },
  },
];

export function resolveCaps(kind: ProviderKind, model: string, override?: Partial<ModelCaps>): ModelCaps {
  const name = model.toLowerCase().split('/').at(-1) ?? model;
  const rule = BUILTIN.find((r) => (!r.kind || r.kind === kind) && r.match.test(name));
  return { ...DEFAULT_CAPS, ...rule?.caps, ...override };
}

export type StructuredMethod = 'jsonSchema' | 'functionCalling' | 'jsonMode' | 'prompt';

/** 按能力选择结构化输出方式（02 §5.2） */
export function pickStructuredMethod(caps: ModelCaps): StructuredMethod {
  if (caps.jsonSchema) return 'jsonSchema';
  if (caps.tools) return 'functionCalling';
  if (caps.jsonMode) return 'jsonMode';
  return 'prompt';
}
