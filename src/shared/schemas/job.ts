/**
 * @file 【公共·schemas】目标岗位与 JD 要求
 * jobExtractOutputSchema 是模型输出（无 id）；jobViewSchema 是落库后的形状。
 * importance：must 是 JD 明确要求的，nice 是加分项。skillGap 会分开统计。
 */
import { z } from 'zod';
import { skillTagSchema } from './skill-tags';

export const requirementImportanceSchema = z.enum(['must', 'nice']);

const requirementExtractSchema = z.object({
  label: z.string().trim().min(1).max(40),
  tag: skillTagSchema,
  importance: requirementImportanceSchema,
  description: z.string().trim().max(300).optional().default(''),
});

export const requirementSchema = requirementExtractSchema.extend({
  id: z.uuid(),
});

export const jobExtractOutputSchema = z.object({
  title: z.string().trim().min(1).max(80),
  company: z.string().trim().max(80).nullable(),
  summary: z.string().trim().max(400).optional().default(''),
  requirements: z.array(requirementExtractSchema).min(1).max(30),
});

export const jobCreateRequestSchema = z.object({
  jdText: z.string().trim().min(10, 'JD 太短').max(20_000),
});

export const jobViewSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  company: z.string().nullable(),
  summary: z.string(),
  rawText: z.string(),
  requirements: z.array(requirementSchema),
  createdAt: z.string(),
});

export type JobExtractOutput = z.infer<typeof jobExtractOutputSchema>;
export type Requirement = z.infer<typeof requirementSchema>;
export type JobView = z.infer<typeof jobViewSchema>;
