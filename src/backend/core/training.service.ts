/**
 * @file 【后端·core】专项训练（R-C2-5）
 * 从诊断报告里挑一条短板，开一场 kind = 'drill' 的面试：
 * 岗位沿用那场面试的岗位，题数取复训计划里给的 questionCount，技能标签写进 settings.drillTag，
 * 之后 plan_questions 只按这个标签召回（见 agent/graphs/interview/graph.ts）。
 * 其余流程（chat / finish / 诊断）和普通面试完全一样，所以这里只负责建会话。
 */
import { getReport, listWeaknessesByReport } from '@/backend/db/repos/diagnosis';
import { insertInterviewSession, toSummary } from '@/backend/db/repos/interviews';
import type { RequestCtx } from '@/shared/common/ctx';
import { AppError } from '@/shared/common/errors';
import { INTERVIEW_LIMITS, type InterviewSettings, type InterviewSummary } from '@/shared/schemas/interview';
import { skillTagSchema } from '@/shared/schemas/skill-tags';

/** 专项训练固定用标准风格、允许 1 次追问；难度放宽到全区间，便于按梯度把人带起来 */
const DRILL_BASE = {
  difficultyMin: 1,
  difficultyMax: 5,
  style: 'standard',
  maxFollowUps: 1,
} satisfies Omit<InterviewSettings, 'questionCount' | 'drillTag'>;

const clampCount = (n: number) =>
  Math.min(INTERVIEW_LIMITS.questionCount.max, Math.max(INTERVIEW_LIMITS.questionCount.min, n));

export async function createTraining(
  ctx: RequestCtx,
  input: { reportId: string; tag: string },
): Promise<InterviewSummary> {
  const report = await getReport(ctx.userId, input.reportId);
  if (!report) throw new AppError('NOT_FOUND', '诊断报告不存在');

  // 只允许练这份报告真的判出来的短板：避免拿任意标签刷题库
  const weaknesses = await listWeaknessesByReport(ctx.userId, input.reportId);
  const weakness = weaknesses.find((item) => item.tag === input.tag);
  if (!weakness) throw new AppError('NOT_FOUND', '这份报告里没有这条短板');
  const tag = skillTagSchema.safeParse(weakness.tag);
  if (!tag.success) throw new AppError('VALIDATION', '这条短板的技能标签已不在标签目录里');

  const planned = report.plan?.items.find((item) => item.tag === weakness.tag)?.questionCount;
  const settings: InterviewSettings = {
    ...DRILL_BASE,
    questionCount: clampCount(planned ?? 3),
    drillTag: tag.data,
  };
  const session = await insertInterviewSession({
    userId: ctx.userId,
    jobId: report.jobId,
    settings,
    kind: 'drill',
  });
  return toSummary(session);
}
