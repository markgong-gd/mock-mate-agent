/**
 * @file 【公共·schemas】文字面试的设置、评估结果和进度
 * 设置会原样放进 interview_sessions.settings。评估结果是 judge 模型的结构化输出。
 */
import { z } from 'zod';
import { skillTagSchema } from './skill-tags';

export const INTERVIEW_STYLES = ['supportive', 'standard', 'strict'] as const;
export type InterviewStyle = (typeof INTERVIEW_STYLES)[number];

export const INTERVIEW_MODES = ['text', 'voice'] as const;
export const INTERVIEW_KINDS = ['normal', 'drill'] as const;
export const INTERVIEW_STATUSES = ['pending', 'running', 'finished'] as const;

export const INTERVIEW_LIMITS = {
  questionCount: { min: 1, max: 12, default: 5 },
  followUps: { min: 0, max: 3, default: 2 },
  answerMaxChars: 4000,
} as const;

export const interviewSettingsSchema = z
  .object({
    questionCount: z
      .number()
      .int()
      .min(INTERVIEW_LIMITS.questionCount.min)
      .max(INTERVIEW_LIMITS.questionCount.max),
    difficultyMin: z.number().int().min(1).max(5),
    difficultyMax: z.number().int().min(1).max(5),
    style: z.enum(INTERVIEW_STYLES),
    maxFollowUps: z.number().int().min(INTERVIEW_LIMITS.followUps.min).max(INTERVIEW_LIMITS.followUps.max),
    /**
     * 专项训练（R-C2-5）只练这一个技能标签：plan_questions 只按它召回。
     * 可选，所以 kind = 'normal' 的旧场次不受影响。
     */
    drillTag: skillTagSchema.optional(),
  })
  .refine((s) => s.difficultyMin <= s.difficultyMax, {
    message: '难度下限不能高于上限',
    path: ['difficultyMax'],
  });

export type InterviewSettings = z.infer<typeof interviewSettingsSchema>;

export const interviewCreateRequestSchema = z.object({
  jobId: z.uuid(),
  settings: interviewSettingsSchema,
});

/** 从报告页一键进入专项训练：只给短板的技能标签，其余设置由后端按复训计划推导 */
export const trainingCreateRequestSchema = z.object({
  reportId: z.uuid(),
  tag: skillTagSchema,
});

export const interviewChatRequestSchema = z.object({
  answer: z.string().max(INTERVIEW_LIMITS.answerMaxChars).default(''),
  idempotencyKey: z
    .string()
    .regex(/^[A-Za-z0-9:_-]{1,80}$/, 'idempotencyKey 只含字母、数字、冒号、下划线和连字符')
    .optional(),
});

/** judge 模型对一轮回答的判断。depth 1 很浅，5 有具体做法和取舍 */
export const answerEvaluationSchema = z.object({
  depth: z.number().int().min(1).max(5),
  needFollowUp: z.boolean(),
  reason: z.string().trim().min(1).max(200),
});

export type AnswerEvaluation = z.infer<typeof answerEvaluationSchema>;

export const INTERVIEW_PHASES = ['planning', 'asking', 'waiting', 'evaluating', 'finished'] as const;

/** 流里的 data-interview-state，也是 GET 恢复时的进度 */
export const interviewProgressSchema = z.object({
  cursor: z.number().int().min(0),
  total: z.number().int().min(0),
  followUpCount: z.number().int().min(0),
  maxFollowUps: z.number().int().min(0),
  phase: z.enum(INTERVIEW_PHASES),
  questionId: z.string().nullable(),
  status: z.enum(['running', 'finished']),
});

export type InterviewProgress = z.infer<typeof interviewProgressSchema>;

export const interviewTurnViewSchema = z.object({
  id: z.uuid(),
  seq: z.number().int(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  questionId: z.string().nullable(),
  isFollowUp: z.boolean(),
});

export type InterviewTurnView = z.infer<typeof interviewTurnViewSchema>;

export const interviewViewSchema = z.object({
  id: z.uuid(),
  jobId: z.uuid(),
  jobTitle: z.string(),
  mode: z.enum(INTERVIEW_MODES),
  kind: z.enum(INTERVIEW_KINDS),
  settings: interviewSettingsSchema,
  status: z.enum(INTERVIEW_STATUSES),
  createdAt: z.string(),
  progress: interviewProgressSchema,
  /** 下一步节点。含 wait_answer 时表示正在等回答 */
  next: z.array(z.string()),
  turns: z.array(interviewTurnViewSchema),
});

export type InterviewView = z.infer<typeof interviewViewSchema>;

export const interviewSummarySchema = z.object({
  id: z.uuid(),
  jobId: z.uuid(),
  jobTitle: z.string(),
  kind: z.enum(INTERVIEW_KINDS),
  status: z.enum(INTERVIEW_STATUSES),
  settings: interviewSettingsSchema,
  createdAt: z.string(),
});

export type InterviewSummary = z.infer<typeof interviewSummarySchema>;
