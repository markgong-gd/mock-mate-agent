/**
 * @file 【后端·core】目标岗位
 * 粘贴 JD → 抽取图 → 落库 → 用档案技能算匹配度。没有档案时匹配度为 0，岗位仍然保存。
 */
import type { RequestCtx } from '@/shared/common/ctx';
import { AppError } from '@/shared/common/errors';
import { getProfile } from '@/backend/db/repos/profile';
import { getJob, insertJob, listJobs } from '@/backend/db/repos/jobs';
import { buildJobExtractGraph, type JobExtractGraph } from '@/agent/graphs/extract/graph';
import { skillGap, type SkillGap } from '@/shared/domain/matching/skill-gap';
import type { JobView } from '@/shared/schemas/job';
import { createUsageHandler } from './usage';

let graph: JobExtractGraph | undefined;
const getGraph = () => (graph ??= buildJobExtractGraph());

export function setJobExtractGraphForTesting(next: JobExtractGraph | undefined) {
  graph = next;
}

async function matchFor(userId: string, job: JobView): Promise<SkillGap> {
  const profile = await getProfile(userId);
  return skillGap(
    profile?.skills.map((skill) => skill.tag) ?? [],
    job.requirements.map((req) => ({ tag: req.tag, label: req.label, importance: req.importance })),
  );
}

export async function listJobViews(ctx: RequestCtx) {
  const [jobs, profile] = await Promise.all([listJobs(ctx.userId), getProfile(ctx.userId)]);
  const tags = profile?.skills.map((skill) => skill.tag) ?? [];
  return {
    jobs: jobs.map((job) => ({
      job,
      match: skillGap(
        tags,
        job.requirements.map((req) => ({ tag: req.tag, label: req.label, importance: req.importance })),
      ),
    })),
  };
}

export async function readJob(ctx: RequestCtx, jobId: string) {
  const job = await getJob(ctx.userId, jobId);
  if (!job) throw new AppError('NOT_FOUND', '目标岗位不存在');
  return { job, match: await matchFor(ctx.userId, job) };
}

export async function createJob(ctx: RequestCtx, jdText: string) {
  const result = await getGraph().invoke(
    { text: jdText },
    {
      configurable: { thread_id: `job:${ctx.requestId}`, userId: ctx.userId, requestId: ctx.requestId },
      callbacks: [createUsageHandler({ userId: ctx.userId, requestId: ctx.requestId })],
    },
  );
  if (!result.draft) throw new AppError('LLM_SCHEMA_INVALID');
  const job = await insertJob(ctx.userId, jdText, result.draft);
  return { job, match: await matchFor(ctx.userId, job) };
}
