/**
 * @file 【公共·schemas】短板
 * 模型只输出 evidenceRef（指向 TRANSCRIPT 里的 [T1] 编号），真实 turnId 和原话由代码回填并校验。
 * 为什么不让模型直接给 turnId：UUID 最容易被编造，而“每个短板都要有证据”是硬要求（R-C3-2）。
 */
import { z } from 'zod';
import { skillTagSchema } from './skill-tags';

export const WEAKNESS_STATUSES = ['open', 'improving', 'closed'] as const;

export type WeaknessStatus = (typeof WEAKNESS_STATUSES)[number];

export const weaknessStatusSchema = z.enum(WEAKNESS_STATUSES);

/** 1 轻微，2 明显，3 严重 */
export const WEAKNESS_SEVERITY = { min: 1, max: 3 } as const;

export const weaknessDraftSchema = z.object({
  tag: skillTagSchema,
  title: z.string().trim().min(1).max(40),
  detail: z.string().trim().min(1).max(300),
  severity: z.number().int().min(WEAKNESS_SEVERITY.min).max(WEAKNESS_SEVERITY.max),
  /** TRANSCRIPT 里的轮次编号，形如 T1 */
  evidenceRef: z.string().regex(/^T\d+$/, 'evidenceRef 形如 T1'),
  /** 候选人回答里的原话 */
  evidenceQuote: z.string().trim().min(1).max(300),
});

export type WeaknessDraft = z.infer<typeof weaknessDraftSchema>;

export const weaknessExtractOutputSchema = z.object({
  weaknesses: z.array(weaknessDraftSchema).max(6),
});

export type WeaknessExtractOutput = z.infer<typeof weaknessExtractOutputSchema>;

export const weaknessItemSchema = z.object({
  id: z.uuid(),
  tag: z.string(),
  label: z.string(),
  title: z.string(),
  detail: z.string(),
  severity: z.number().int(),
  status: weaknessStatusSchema,
  evidenceTurnId: z.uuid().nullable(),
  evidenceQuote: z.string(),
});

export type WeaknessItem = z.infer<typeof weaknessItemSchema>;
