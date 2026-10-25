/**
 * @file 【公共·schemas】单场用量与成本（N-12）
 * 数据来自 llm_calls（只有元数据，没有正文）。成本不落库：
 * 单价会变，存下来就对不上账，所以读的时候用 agent/llm/pricing.ts 现算，单价缺失时为 null。
 */
import { z } from 'zod';

export const USAGE_CURRENCY = 'CNY' as const;

export const usageTotalsSchema = z.object({
  calls: z.number().int(),
  errors: z.number().int(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  /** 单价未配置时为 null，前端显示“未配置单价”而不是 0 */
  cost: z.number().nullable(),
  currency: z.literal(USAGE_CURRENCY),
});

export type UsageTotals = z.infer<typeof usageTotalsSchema>;

/** 按 functionId（interview.ask / diagnosis.score ...）分组，用来看钱花在哪一步 */
export const usageByFunctionSchema = usageTotalsSchema.extend({
  functionId: z.string(),
  avgLatencyMs: z.number().int(),
});

export const usageModelSchema = usageTotalsSchema.extend({
  model: z.string(),
  priced: z.boolean(),
});

export const sessionUsageSchema = z.object({
  sessionId: z.uuid(),
  totals: usageTotalsSchema,
  byFunction: z.array(usageByFunctionSchema),
  byModel: z.array(usageModelSchema),
  /** 单场 Token 上限与已用占比，超过就不再推进面试（BUDGET_EXCEEDED） */
  budget: z.object({ tokenLimit: z.number().int(), used: z.number().int(), exceeded: z.boolean() }),
});

export type SessionUsage = z.infer<typeof sessionUsageSchema>;
