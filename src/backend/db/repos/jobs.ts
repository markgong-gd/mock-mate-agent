/**
 * @file 【后端·db】岗位仓储
 * 每个方法都带 userId。getJob 同时查要求，调用方拿到的就是页面要展示的结构。
 */
import { and, asc, desc, eq } from 'drizzle-orm';
import { newId } from '@/shared/common/ids';
import type { JobExtractOutput, JobView, Requirement } from '@/shared/schemas/job';
import { getDb } from '../client';
import { jobRequirements, jobTargets } from '../schema';

function toView(
  job: typeof jobTargets.$inferSelect,
  requirements: (typeof jobRequirements.$inferSelect)[],
): JobView {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    summary: job.summary,
    rawText: job.rawText,
    createdAt: job.createdAt.toISOString(),
    requirements: requirements.map((req) => ({
      id: req.id,
      label: req.label,
      tag: req.tag as Requirement['tag'],
      importance: req.importance,
      description: req.description,
    })),
  };
}

export async function insertJob(userId: string, rawText: string, extracted: JobExtractOutput): Promise<JobView> {
  const db = getDb();
  const jobId = newId();
  const requirements = extracted.requirements.map((req, index) => ({
    id: newId(),
    userId,
    jobTargetId: jobId,
    label: req.label,
    tag: req.tag,
    importance: req.importance,
    description: req.description,
    sortOrder: index,
  }));
  await db.transaction(async (tx) => {
    await tx.insert(jobTargets).values({
      id: jobId,
      userId,
      title: extracted.title,
      company: extracted.company,
      summary: extracted.summary,
      rawText,
    });
    await tx.insert(jobRequirements).values(requirements);
  });
  const job = await getJob(userId, jobId);
  if (!job) throw new Error('岗位写入后读不到');
  return job;
}

export async function listJobs(userId: string): Promise<JobView[]> {
  const jobs = await getDb()
    .select()
    .from(jobTargets)
    .where(eq(jobTargets.userId, userId))
    .orderBy(desc(jobTargets.createdAt));
  const views: JobView[] = [];
  for (const job of jobs) {
    const reqs = await getDb()
      .select()
      .from(jobRequirements)
      .where(and(eq(jobRequirements.jobTargetId, job.id), eq(jobRequirements.userId, userId)))
      .orderBy(asc(jobRequirements.sortOrder));
    views.push(toView(job, reqs));
  }
  return views;
}

export async function getJob(userId: string, jobId: string): Promise<JobView | null> {
  const [job] = await getDb()
    .select()
    .from(jobTargets)
    .where(and(eq(jobTargets.id, jobId), eq(jobTargets.userId, userId)));
  if (!job) return null;
  const reqs = await getDb()
    .select()
    .from(jobRequirements)
    .where(and(eq(jobRequirements.jobTargetId, jobId), eq(jobRequirements.userId, userId)))
    .orderBy(asc(jobRequirements.sortOrder));
  return toView(job, reqs);
}
