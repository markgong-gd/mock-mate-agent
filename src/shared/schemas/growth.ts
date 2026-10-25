/**
 * @file 【公共·schemas】成长曲线（R-C3-5）
 * 数据来自 skill_score_history（每份报告每个技能一行）与 diagnosis_reports.overall，
 * 这里只定义接口形状：按技能分组的折线 + 总分折线，时间统一用 ISO 字符串。
 */
import { z } from 'zod';

export const growthPointSchema = z.object({
  reportId: z.uuid(),
  sessionId: z.uuid(),
  jobTitle: z.string(),
  score: z.number(),
  /** 这个技能在那一场被问到的题数，样本太少时前端会标注 */
  sampleCount: z.number().int(),
  rubricVersion: z.string(),
  createdAt: z.string(),
});

export type GrowthPoint = z.infer<typeof growthPointSchema>;

export const growthSkillSchema = z.object({
  tag: z.string(),
  label: z.string(),
  /** 按时间升序 */
  points: z.array(growthPointSchema).min(1),
  first: z.number(),
  last: z.number(),
  /** last - first，正数表示在进步 */
  delta: z.number(),
});

export type GrowthSkill = z.infer<typeof growthSkillSchema>;

export const growthOverallPointSchema = z.object({
  reportId: z.uuid(),
  jobTitle: z.string(),
  overall: z.number(),
  rubricVersion: z.string(),
  createdAt: z.string(),
});

export const growthViewSchema = z.object({
  /** 出现次数多、变化大的技能排在前面 */
  skills: z.array(growthSkillSchema),
  overall: z.array(growthOverallPointSchema),
});

export type GrowthView = z.infer<typeof growthViewSchema>;
