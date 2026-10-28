/**
 * @file 【公共·schemas】对话式简历策划
 * 这场对话自己收集岗位、技能和经历，不引用档案事实，所以没有 factRefs。
 * 模型每轮输出一份提案；能不能写进预览由 domain/studio 决定。
 */
import { z } from 'zod';

export const STUDIO_FOCUSES = ['basics', 'summary', 'skills', 'experience', 'projects', 'education'] as const;
export const STUDIO_STATUSES = ['active', 'ready'] as const;
export const STUDIO_ACTIONS = ['ask', 'revise', 'ready'] as const;

export const STUDIO_LIMITS = {
  messageMaxChars: 8000,
  titleMax: 40,
} as const;

const line = (max: number) => z.string().trim().max(max).default('');
const bullets = (max: number) => z.array(z.string().trim().min(1).max(400)).max(max).default([]);

export const studioBasicsSchema = z.object({
  name: line(40),
  headline: line(80),
  phone: line(40),
  email: line(80),
  location: line(40),
});

export const studioExperienceSchema = z.object({
  org: line(80),
  title: line(80),
  start: line(20),
  end: line(20),
  bullets: bullets(8),
});

export const studioProjectSchema = z.object({
  name: line(80),
  bullets: bullets(8),
});

export const studioEducationSchema = z.object({
  school: line(80),
  degree: line(80),
  start: line(20),
  end: line(20),
  bullets: bullets(6),
});

export const studioDocumentSchema = z.object({
  basics: studioBasicsSchema.default({ name: '', headline: '', phone: '', email: '', location: '' }),
  summary: line(600),
  skills: z.array(z.string().trim().min(1).max(40)).max(24).default([]),
  experiences: z.array(studioExperienceSchema).max(8).default([]),
  projects: z.array(studioProjectSchema).max(8).default([]),
  education: z.array(studioEducationSchema).max(6).default([]),
});

export type StudioFocus = (typeof STUDIO_FOCUSES)[number];
export type StudioStatus = (typeof STUDIO_STATUSES)[number];
export type StudioDocument = z.infer<typeof studioDocumentSchema>;
export type StudioExperience = z.infer<typeof studioExperienceSchema>;
export type StudioProject = z.infer<typeof studioProjectSchema>;
export type StudioEducation = z.infer<typeof studioEducationSchema>;

/** 每次调用都是新对象，避免和 schema 的默认数组共用引用 */
export function emptyStudioDocument(): StudioDocument {
  const parsed = studioDocumentSchema.parse({});
  return {
    basics: { ...parsed.basics },
    summary: '',
    skills: [],
    experiences: [],
    projects: [],
    education: [],
  };
}

/** 策划师一轮的结构化提案。say 是给用户看的话，document 是整份新稿 */
export const studioCoachProposalSchema = z.object({
  say: z.string().trim().min(1).max(800),
  action: z.enum(STUDIO_ACTIONS),
  targetRole: line(80),
  focus: z.enum(STUDIO_FOCUSES).default('basics'),
  document: studioDocumentSchema,
});

export type StudioCoachProposal = z.infer<typeof studioCoachProposalSchema>;

export const studioCreateRequestSchema = z.object({
  title: z.string().trim().min(1, '请填一个标题').max(STUDIO_LIMITS.titleMax),
});

export const studioChatRequestSchema = z.object({
  message: z.string().max(STUDIO_LIMITS.messageMaxChars).default(''),
  idempotencyKey: z
    .string()
    .regex(/^[A-Za-z0-9:_-]{1,80}$/, 'idempotencyKey 只含字母、数字、冒号、下划线和连字符')
    .optional(),
});

export const STUDIO_TRACE_KINDS = ['observe', 'think', 'model', 'tool'] as const;
export const STUDIO_TRACE_STATUSES = ['running', 'ok', 'error'] as const;

/** 一轮策划里的一步。输入输出是这一步实际看到和产出的文本，刷新后仍在 */
export const studioTraceStepSchema = z.object({
  id: z.string().min(1).max(80),
  seq: z.number().int().nonnegative(),
  kind: z.enum(STUDIO_TRACE_KINDS),
  status: z.enum(STUDIO_TRACE_STATUSES),
  title: z.string().min(1).max(160),
  at: z.string().max(40),
  alias: z.string().max(40).optional(),
  provider: z.string().max(80).optional(),
  model: z.string().max(160).optional(),
  functionId: z.string().max(80).optional(),
  promptVersion: z.string().max(80).optional(),
  method: z.string().max(40).optional(),
  latencyMs: z.number().int().nonnegative().optional(),
  inputTokens: z.number().int().nonnegative().nullable().optional(),
  outputTokens: z.number().int().nonnegative().nullable().optional(),
  attempts: z.number().int().positive().optional(),
  input: z.string().max(20_000).optional(),
  output: z.string().max(20_000).optional(),
  note: z.string().max(500).optional(),
});

export type StudioTraceKind = (typeof STUDIO_TRACE_KINDS)[number];
export type StudioTraceStatus = (typeof STUDIO_TRACE_STATUSES)[number];
export type StudioTraceStep = z.infer<typeof studioTraceStepSchema>;

export const studioTurnViewSchema = z.object({
  id: z.uuid(),
  seq: z.number().int(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

export const studioSummarySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  status: z.enum(STUDIO_STATUSES),
  targetRole: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const studioViewSchema = studioSummarySchema.extend({
  focus: z.enum(STUDIO_FOCUSES),
  document: studioDocumentSchema,
  /** 图已经跑起来，刷新后续聊靠它判断 */
  started: z.boolean(),
  /** 停在等用户回复 */
  waiting: z.boolean(),
  turns: z.array(studioTurnViewSchema),
  /** 已完成的运行步骤。进行中的那一步只在流里，节点结束后才进入这里 */
  traces: z.array(studioTraceStepSchema).default([]),
});

/** 流里的 data-studio-resume。预览不等这轮文字说完 */
export const studioResumeEventSchema = z.object({
  document: studioDocumentSchema,
  focus: z.enum(STUDIO_FOCUSES),
  status: z.enum(STUDIO_STATUSES),
  targetRole: z.string(),
});

export const studioExportSchema = z.object({
  title: z.string(),
  targetRole: z.string(),
  document: studioDocumentSchema,
});

export type StudioTurnView = z.infer<typeof studioTurnViewSchema>;
export type StudioSummary = z.infer<typeof studioSummarySchema>;
export type StudioView = z.infer<typeof studioViewSchema>;
export type StudioResumeEvent = z.infer<typeof studioResumeEventSchema>;
export type StudioExport = z.infer<typeof studioExportSchema>;
