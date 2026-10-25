/**
 * @file 【公共·schemas】诊断报告
 * answerScoreSchema 是 judge 模型逐题打分的输出；diagnosisScoresSchema 是整份报告，整取整存放在 scores（jsonb）。
 * 报告不复制回答正文：逐题点评靠 turnId 关联 interview_turns，正文只有一份（便于一键删除）。
 */
import { z } from 'zod';
import { interviewTurnViewSchema } from './interview';
import { rubricDefinitionSchema, rubricDimensionKeySchema, RUBRIC_SCORE } from './rubric';
import { skillTagSchema } from './skill-tags';
import { weaknessItemSchema } from './weakness';

export const DIAGNOSIS_STATUSES = ['pending', 'running', 'done', 'failed'] as const;

export type DiagnosisStatus = (typeof DIAGNOSIS_STATUSES)[number];

export const diagnosisStatusSchema = z.enum(DIAGNOSIS_STATUSES);

export const dimensionScoreSchema = z.object({
  key: rubricDimensionKeySchema,
  score: z.number().int().min(RUBRIC_SCORE.min).max(RUBRIC_SCORE.max),
});

/** judge 模型对单轮回答的打分（不含 id，id 由代码回填） */
export const answerScoreSchema = z.object({
  dimensions: z.array(dimensionScoreSchema).min(1),
  comment: z.string().trim().min(1).max(300),
  /** 答到的点；没有就空字符串 */
  highlight: z.string().trim().max(200).default(''),
  /** 缺的点；没有就空字符串 */
  gap: z.string().trim().max(200).default(''),
});

export type AnswerScore = z.infer<typeof answerScoreSchema>;

export const scoredAnswerSchema = answerScoreSchema.extend({
  turnId: z.uuid(),
  seq: z.number().int(),
  questionId: z.string().nullable(),
  /** 题干（来自题库，不含 PII） */
  question: z.string(),
  skillTags: z.array(z.string()),
  /** 这一轮按 Rubric 权重折算出的分数 */
  score: z.number(),
});

export type ScoredAnswer = z.infer<typeof scoredAnswerSchema>;

export const dimensionResultSchema = z.object({
  key: rubricDimensionKeySchema,
  label: z.string(),
  weight: z.number(),
  score: z.number(),
});

export const skillResultSchema = z.object({
  tag: z.string(),
  label: z.string(),
  score: z.number(),
  count: z.number().int(),
});

/** diagnosis_reports.scores */
export const diagnosisScoresSchema = z.object({
  overall: z.number(),
  dimensions: z.array(dimensionResultSchema),
  skills: z.array(skillResultSchema),
  answers: z.array(scoredAnswerSchema),
});

export type DiagnosisScores = z.infer<typeof diagnosisScoresSchema>;

export const trainingPlanItemSchema = z.object({
  tag: skillTagSchema,
  focus: z.string().trim().min(1).max(60),
  actions: z.array(z.string().trim().min(1).max(200)).min(1).max(4),
  questionCount: z.number().int().min(1).max(10),
});

/** diagnosis_reports.plan（模型输出与落库同形） */
export const trainingPlanSchema = z.object({
  summary: z.string().trim().max(300).default(''),
  items: z.array(trainingPlanItemSchema).max(6),
});

export type TrainingPlan = z.infer<typeof trainingPlanSchema>;

export const diagnosisReportSummarySchema = z.object({
  id: z.uuid(),
  sessionId: z.uuid(),
  jobId: z.uuid(),
  jobTitle: z.string(),
  rubricVersion: z.string(),
  status: diagnosisStatusSchema,
  overall: z.number().nullable(),
  createdAt: z.string(),
});

export type DiagnosisReportSummary = z.infer<typeof diagnosisReportSummarySchema>;

export const diagnosisReportViewSchema = diagnosisReportSummarySchema.extend({
  updatedAt: z.string(),
  /** 失败原因；成功时为 null */
  error: z.string().nullable(),
  /** 本份报告所用的 Rubric 定义（R-C3-6 要求对用户可见） */
  rubric: rubricDefinitionSchema.nullable(),
  scores: diagnosisScoresSchema.nullable(),
  plan: trainingPlanSchema.nullable(),
  weaknesses: z.array(weaknessItemSchema),
  /** 逐题点评要配回答原文，正文只从这里取 */
  turns: z.array(interviewTurnViewSchema),
});

export type DiagnosisReportView = z.infer<typeof diagnosisReportViewSchema>;

export const reportListQuerySchema = z.object({
  sessionId: z.uuid().optional(),
});
