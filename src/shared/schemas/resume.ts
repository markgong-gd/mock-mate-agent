/**
 * @file 【公共·schemas】定制简历
 * 每条 bullet 的 factRefs 至少 1 个：这是 Zod 层的硬门槛，空引用在进 guard 之前就会失败。
 * status 由 factRefGuard 改写，模型自己标 verified 不算数。
 * 整份内容存 resumes.content（jsonb）：简历总是整份读写，不需要按 bullet 做 SQL 统计。
 */
import { z } from 'zod';

export const bulletStatusSchema = z.enum(['verified', 'unverified']);

export const bulletSchema = z.object({
  text: z.string().trim().min(1, '描述不能为空').max(400),
  factRefs: z.array(z.uuid()).min(1, '每条描述必须关联至少一条事实'),
  status: bulletStatusSchema.default('verified'),
});

export const resumeSectionSchema = z.object({
  heading: z.string().trim().min(1).max(40),
  bullets: z.array(bulletSchema).min(1).max(12),
});

/** 模型输出与落库内容使用同一形状。status 可省略，解析时默认为 verified，随后由 guard 覆盖 */
export const resumeContentSchema = z.object({
  headline: z.string().trim().min(1).max(80),
  summary: z.string().trim().min(1).max(600),
  sections: z.array(resumeSectionSchema).min(1).max(8),
});

export const resumeGenerateRequestSchema = z.object({
  jobId: z.uuid(),
});

export const resumeUpdateSchema = resumeContentSchema.extend({
  /** true：另存为同一 JD 的新版本；false：覆盖当前版本 */
  asNewVersion: z.boolean().optional().default(false),
});

export const resumeViewSchema = z.object({
  id: z.uuid(),
  jobId: z.uuid(),
  jobTitle: z.string(),
  version: z.number().int().positive(),
  template: z.literal('classic'),
  content: resumeContentSchema,
  createdAt: z.string(),
});

export const retrievedFactSchema = z.object({
  id: z.uuid(),
  experienceId: z.uuid(),
  text: z.string(),
  score: z.number(),
});

export type Bullet = z.infer<typeof bulletSchema>;
export type ResumeContent = z.infer<typeof resumeContentSchema>;
export type ResumeEditInput = z.infer<typeof resumeUpdateSchema>;
export type ResumeView = z.infer<typeof resumeViewSchema>;
export type RetrievedFact = z.infer<typeof retrievedFactSchema>;
