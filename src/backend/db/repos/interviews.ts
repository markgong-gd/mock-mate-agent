/**
 * @file 【后端·db】面试会话与轮次
 * 每个方法都带 userId。轮次的 seq 在事务里取 max+1，调用方还要拿同一场面试的 advisory lock，避免两个人同时往前推。
 */
import { and, asc, desc, eq, gt, sql } from 'drizzle-orm';
import { newId } from '@/shared/common/ids';
import type { InterviewSettings, InterviewSummary } from '@/shared/schemas/interview';
import { getDb } from '../client';
import { interviewSessions, interviewTurns, jobTargets } from '../schema';

export interface SessionRow {
  id: string;
  userId: string;
  jobTargetId: string;
  jobTitle: string;
  mode: 'text' | 'voice';
  kind: 'normal' | 'drill';
  settings: InterviewSettings;
  status: 'pending' | 'running' | 'finished';
  createdAt: Date;
}

export function toSummary(row: SessionRow): InterviewSummary {
  return {
    id: row.id,
    jobId: row.jobTargetId,
    jobTitle: row.jobTitle,
    kind: row.kind,
    status: row.status,
    settings: row.settings,
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadSession(userId: string, sessionId: string): Promise<SessionRow | null> {
  const [row] = await getDb()
    .select({
      id: interviewSessions.id,
      userId: interviewSessions.userId,
      jobTargetId: interviewSessions.jobTargetId,
      jobTitle: jobTargets.title,
      mode: interviewSessions.mode,
      kind: interviewSessions.kind,
      settings: interviewSessions.settings,
      status: interviewSessions.status,
      createdAt: interviewSessions.createdAt,
    })
    .from(interviewSessions)
    .innerJoin(
      jobTargets,
      and(eq(jobTargets.id, interviewSessions.jobTargetId), eq(jobTargets.userId, userId)),
    )
    .where(and(eq(interviewSessions.id, sessionId), eq(interviewSessions.userId, userId)));
  return row ?? null;
}

export async function insertInterviewSession(input: {
  userId: string;
  jobId: string;
  settings: InterviewSettings;
  /** 专项训练传 'drill'；默认普通面试 */
  kind?: SessionRow['kind'];
}): Promise<SessionRow> {
  const id = newId();
  await getDb()
    .insert(interviewSessions)
    .values({
      id,
      userId: input.userId,
      jobTargetId: input.jobId,
      mode: 'text',
      kind: input.kind ?? 'normal',
      settings: input.settings,
      status: 'pending',
    });
  const saved = await loadSession(input.userId, id);
  if (!saved) throw new Error('面试会话写入后读不到');
  return saved;
}

export async function getInterviewSession(userId: string, sessionId: string): Promise<SessionRow | null> {
  return loadSession(userId, sessionId);
}

export async function listInterviewSessions(userId: string, limit = 20): Promise<InterviewSummary[]> {
  const rows = await getDb()
    .select({
      id: interviewSessions.id,
      userId: interviewSessions.userId,
      jobTargetId: interviewSessions.jobTargetId,
      jobTitle: jobTargets.title,
      mode: interviewSessions.mode,
      kind: interviewSessions.kind,
      settings: interviewSessions.settings,
      status: interviewSessions.status,
      createdAt: interviewSessions.createdAt,
    })
    .from(interviewSessions)
    .innerJoin(
      jobTargets,
      and(eq(jobTargets.id, interviewSessions.jobTargetId), eq(jobTargets.userId, userId)),
    )
    .where(eq(interviewSessions.userId, userId))
    .orderBy(desc(interviewSessions.createdAt))
    .limit(limit);
  return rows.map(toSummary);
}

export async function setInterviewStatus(userId: string, sessionId: string, status: SessionRow['status']) {
  await getDb()
    .update(interviewSessions)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(interviewSessions.userId, userId), eq(interviewSessions.id, sessionId)));
}

export interface TurnRow {
  id: string;
  seq: number;
  role: 'user' | 'assistant';
  content: string;
  questionId: string | null;
  isFollowUp: boolean;
  idempotencyKey: string | null;
}

export async function listInterviewTurns(userId: string, sessionId: string): Promise<TurnRow[]> {
  return getDb()
    .select({
      id: interviewTurns.id,
      seq: interviewTurns.seq,
      role: interviewTurns.role,
      content: interviewTurns.content,
      questionId: interviewTurns.questionId,
      isFollowUp: interviewTurns.isFollowUp,
      idempotencyKey: interviewTurns.idempotencyKey,
    })
    .from(interviewTurns)
    .where(and(eq(interviewTurns.userId, userId), eq(interviewTurns.sessionId, sessionId)))
    .orderBy(asc(interviewTurns.seq));
}

export async function findTurnByIdempotency(
  userId: string,
  sessionId: string,
  idempotencyKey: string,
): Promise<TurnRow | null> {
  const [row] = await getDb()
    .select({
      id: interviewTurns.id,
      seq: interviewTurns.seq,
      role: interviewTurns.role,
      content: interviewTurns.content,
      questionId: interviewTurns.questionId,
      isFollowUp: interviewTurns.isFollowUp,
      idempotencyKey: interviewTurns.idempotencyKey,
    })
    .from(interviewTurns)
    .where(
      and(
        eq(interviewTurns.userId, userId),
        eq(interviewTurns.sessionId, sessionId),
        eq(interviewTurns.idempotencyKey, idempotencyKey),
      ),
    );
  return row ?? null;
}

export async function findFollowingAssistant(
  userId: string,
  sessionId: string,
  seq: number,
): Promise<TurnRow | null> {
  const [row] = await getDb()
    .select({
      id: interviewTurns.id,
      seq: interviewTurns.seq,
      role: interviewTurns.role,
      content: interviewTurns.content,
      questionId: interviewTurns.questionId,
      isFollowUp: interviewTurns.isFollowUp,
      idempotencyKey: interviewTurns.idempotencyKey,
    })
    .from(interviewTurns)
    .where(
      and(
        eq(interviewTurns.userId, userId),
        eq(interviewTurns.sessionId, sessionId),
        gt(interviewTurns.seq, seq),
        eq(interviewTurns.role, 'assistant'),
      ),
    )
    .orderBy(asc(interviewTurns.seq))
    .limit(1);
  return row ?? null;
}

async function nextSeq(userId: string, sessionId: string): Promise<number> {
  const [row] = await getDb()
    .select({ max: sql<number>`coalesce(max(${interviewTurns.seq}), 0)::int` })
    .from(interviewTurns)
    .where(and(eq(interviewTurns.userId, userId), eq(interviewTurns.sessionId, sessionId)));
  return Number(row?.max ?? 0) + 1;
}

export async function insertUserTurn(input: {
  userId: string;
  sessionId: string;
  content: string;
  questionId: string | null;
  idempotencyKey: string;
  isFollowUp?: boolean;
}): Promise<TurnRow> {
  const id = newId();
  const seq = await nextSeq(input.userId, input.sessionId);
  const [row] = await getDb()
    .insert(interviewTurns)
    .values({
      id,
      userId: input.userId,
      sessionId: input.sessionId,
      seq,
      role: 'user',
      content: input.content,
      questionId: input.questionId,
      isFollowUp: input.isFollowUp ?? false,
      idempotencyKey: input.idempotencyKey,
    })
    .returning({
      id: interviewTurns.id,
      seq: interviewTurns.seq,
      role: interviewTurns.role,
      content: interviewTurns.content,
      questionId: interviewTurns.questionId,
      isFollowUp: interviewTurns.isFollowUp,
      idempotencyKey: interviewTurns.idempotencyKey,
    });
  if (!row) throw new Error('回答写入后读不到');
  return row;
}

export async function insertAssistantTurn(input: {
  userId: string;
  sessionId: string;
  content: string;
  questionId: string;
  isFollowUp: boolean;
}): Promise<void> {
  const seq = await nextSeq(input.userId, input.sessionId);
  await getDb().insert(interviewTurns).values({
    id: newId(),
    userId: input.userId,
    sessionId: input.sessionId,
    seq,
    role: 'assistant',
    content: input.content,
    questionId: input.questionId,
    isFollowUp: input.isFollowUp,
  });
}
