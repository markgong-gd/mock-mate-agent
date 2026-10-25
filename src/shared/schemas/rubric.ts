/**
 * @file 【公共·schemas】评分标准（Rubric）
 * 维度、权重和 1–5 分锚点都对用户可见，并按 version 版本化（R-C3-6）。
 * 定义整取整存，放在 rubrics.definition（jsonb），读写都过这里的 Schema。
 * 维度 key 是封闭枚举：报告里的雷达图、skill_score_history 和一致性评测都按 key 对齐。
 */
import { z } from 'zod';

export const RUBRIC_DIMENSIONS = ['tech_depth', 'structure', 'job_fit', 'communication'] as const;

export type RubricDimensionKey = (typeof RUBRIC_DIMENSIONS)[number];

export const rubricDimensionKeySchema = z.enum(RUBRIC_DIMENSIONS);

/** 打分区间。改这里要同时改 Rubric 锚点和一致性评测的阈值 */
export const RUBRIC_SCORE = { min: 1, max: 5 } as const;

export const rubricAnchorSchema = z.object({
  score: z.number().int().min(RUBRIC_SCORE.min).max(RUBRIC_SCORE.max),
  text: z.string().trim().min(1).max(200),
});

export const rubricDimensionSchema = z.object({
  key: rubricDimensionKeySchema,
  label: z.string().trim().min(1).max(20),
  description: z.string().trim().min(1).max(200),
  /** 算总分时的权重，各维度之和为 1 */
  weight: z.number().min(0).max(1),
  anchors: z.array(rubricAnchorSchema).min(2).max(5),
});

export const rubricDefinitionSchema = z
  .object({
    version: z.string().regex(/^v\d+$/, 'Rubric 版本形如 v1'),
    title: z.string().trim().min(1).max(40),
    /** 报告页展示的说明，含反偏见声明（N-8） */
    notes: z.array(z.string().trim().min(1).max(200)).max(8).default([]),
    dimensions: z.array(rubricDimensionSchema).min(1).max(8),
  })
  .refine((r) => new Set(r.dimensions.map((d) => d.key)).size === r.dimensions.length, {
    message: '维度 key 不能重复',
    path: ['dimensions'],
  })
  .refine((r) => Math.abs(r.dimensions.reduce((sum, d) => sum + d.weight, 0) - 1) < 1e-6, {
    message: '各维度权重之和必须为 1',
    path: ['dimensions'],
  });

export type RubricDefinition = z.infer<typeof rubricDefinitionSchema>;
export type RubricDimension = z.infer<typeof rubricDimensionSchema>;

/** 种子文件的形状：active 指定上线版本（同一时间只有一个） */
export const rubricSeedSchema = z.object({
  active: z.boolean().default(false),
  definition: rubricDefinitionSchema,
});

export type RubricSeed = z.infer<typeof rubricSeedSchema>;
