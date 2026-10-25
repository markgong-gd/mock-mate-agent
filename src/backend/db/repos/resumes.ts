/**
 * @file 【后端·db】简历仓储
 * 版本只增不改：生成和编辑都插入新行。写到一半失败时，上一版还在。
 * 同一岗位的 version 用事务级 advisory lock 串行递增，避免两次生成拿到同一个版本号。
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { newId } from '@/shared/common/ids';
import { resumeContentSchema, type ResumeContent, type ResumeView } from '@/shared/schemas/resume';
import { getDb } from '../client';
import { jobTargets, resumes } from '../schema';

function toView(
  row: typeof resumes.$inferSelect,
  jobTitle: string,
): ResumeView {
  return {
    id: row.id,
    jobId: row.jobTargetId,
    jobTitle,
    version: row.version,
    template: 'classic',
    content: resumeContentSchema.parse(row.content),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function insertResumeVersion(
  userId: string,
  jobId: string,
  content: ResumeContent,
): Promise<ResumeView> {
  const db = getDb();
  const id = newId();
  let version = 1;
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${userId}:${jobId}`}))`);
    const [max] = await tx
      .select({ version: sql<number>`coalesce(max(${resumes.version}), 0)` })
      .from(resumes)
      .where(and(eq(resumes.userId, userId), eq(resumes.jobTargetId, jobId)));
    version = Number(max?.version ?? 0) + 1;
    await tx.insert(resumes).values({
      id,
      userId,
      jobTargetId: jobId,
      version,
      template: 'classic',
      content,
    });
  });
  const saved = await getResume(userId, id);
  if (!saved) throw new Error('简历写入后读不到');
  return saved;
}

export async function listResumes(userId: string, jobId?: string): Promise<ResumeView[]> {
  const rows = await getDb()
    .select({ resume: resumes, jobTitle: jobTargets.title })
    .from(resumes)
    .innerJoin(jobTargets, and(eq(jobTargets.id, resumes.jobTargetId), eq(jobTargets.userId, userId)))
    .where(and(eq(resumes.userId, userId), jobId ? eq(resumes.jobTargetId, jobId) : undefined))
    .orderBy(desc(resumes.createdAt));
  return rows.map((row) => toView(row.resume, row.jobTitle));
}

/** 覆盖某一版的正文。生成失败不会走到这里；编辑时用户可以选择覆盖或另存。 */
export async function updateResumeContent(
  userId: string,
  resumeId: string,
  content: ResumeContent,
): Promise<ResumeView | null> {
  const updated = await getDb()
    .update(resumes)
    .set({ content })
    .where(and(eq(resumes.userId, userId), eq(resumes.id, resumeId)))
    .returning({ id: resumes.id });
  if (updated.length === 0) return null;
  return getResume(userId, resumeId);
}

export async function getResume(userId: string, resumeId: string): Promise<ResumeView | null> {
  const [row] = await getDb()
    .select({ resume: resumes, jobTitle: jobTargets.title })
    .from(resumes)
    .innerJoin(jobTargets, and(eq(jobTargets.id, resumes.jobTargetId), eq(jobTargets.userId, userId)))
    .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)));
  return row ? toView(row.resume, row.jobTitle) : null;
}
