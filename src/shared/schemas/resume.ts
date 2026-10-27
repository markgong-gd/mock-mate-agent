/**
 * @file 【公共·schemas】定制简历
 * 每条 bullet 的 factRefs 至少 1 个：这是 Zod 层的硬门槛，空引用在进 guard 之前就会失败。
 * status 由 factRefGuard 改写，模型自己标 verified 不算数。
 * 整份内容存 resumes.content（jsonb）：简历总是整份读写，不需要按 bullet 做 SQL 统计。
 * quality 另存，由简历标准现算，不放进模型输出。
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

/** 省略 jobId 时生成主简历，不针对具体岗位 */
export const resumeGenerateRequestSchema = z.object({
  jobId: z.uuid().optional(),
});

export const RESUME_STANDARD_VERSION = 'resume-standard@1' as const;

export const resumeIssueLevelSchema = z.enum(['error', 'warning']);

export const resumeIssueCodeSchema = z.enum([
  'skill_not_in_profile',
  'proficiency_upgrade',
  'dropped_number',
  'empty_phrase',
  'too_many_bullets',
  'section_order',
]);

export const resumeIssueSchema = z.object({
  level: resumeIssueLevelSchema,
  code: resumeIssueCodeSchema,
  message: z.string().trim().min(1).max(200),
  /** 例如 sections.0.bullets.1，栏目级问题可以只到 sections.0 */
  path: z.string().trim().min(1).max(40).optional(),
});

export const resumeQualitySchema = z.object({
  version: z.literal(RESUME_STANDARD_VERSION),
  issues: z.array(resumeIssueSchema).max(40),
});

export const resumeUpdateSchema = resumeContentSchema.extend({
  /** true：另存为同一 JD 的新版本；false：覆盖当前版本 */
  asNewVersion: z.boolean().optional().default(false),
});

export const resumeKindSchema = z.enum(['master', 'tailored']);

export const resumeViewSchema = z.object({
  id: z.uuid(),
  kind: resumeKindSchema,
  /** 主简历没有岗位 */
  jobId: z.uuid().nullable(),
  jobTitle: z.string(),
  version: z.number().int().positive(),
  template: z.literal('classic'),
  content: resumeContentSchema,
  quality: resumeQualitySchema,
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
export type ResumeQuality = z.infer<typeof resumeQualitySchema>;
export type ResumeIssue = z.infer<typeof resumeIssueSchema>;
export type RetrievedFact = z.infer<typeof retrievedFactSchema>;
