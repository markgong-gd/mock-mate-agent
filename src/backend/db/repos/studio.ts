/**
 * @file 【后端·db】简历策划会话与轮次
 * 每个方法都带 userId。轮次 seq 在事务里取 max+1，调用方还要拿同一场的 advisory lock。
 * 删除会话时轮次随外键级联去掉。
 */
import { and, asc, desc, eq, gt, sql } from 'drizzle-orm';
import { newId } from '@/shared/common/ids';
import {
  emptyStudioDocument,
  studioDocumentSchema,
  type StudioDocument,
  type StudioFocus,
  type StudioStatus,
  type StudioSummary,
} from '@/shared/schemas/studio';
import { getDb } from '../client';
import { studioSessions, studioTurns } from '../schema';

export interface StudioSessionRow {
  id: string;
  userId: string;
  title: string;
  status: StudioStatus;
  document: StudioDocument;
  targetRole: string;
  focus: StudioFocus;
  createdAt: Date;
  updatedAt: Date;
}

export interface StudioTurnRow {
  id: string;
  seq: number;
  role: 'user' | 'assistant';
  content: string;
  idempotencyKey: string | null;
}

function toRow(row: typeof studioSessions.$inferSelect): StudioSessionRow {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    status: row.status,
    document: studioDocumentSchema.parse(row.document),
    targetRole: row.targetRole,
    focus: row.focus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toStudioSummary(row: StudioSessionRow): StudioSummary {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    targetRole: row.targetRole,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function insertStudioSession(input: {
  userId: string;
  title: string;
}): Promise<StudioSessionRow> {
  const id = newId();
  const [row] = await getDb()
    .insert(studioSessions)
    .values({
      id,
      userId: input.userId,
      title: input.title,
      status: 'active',
      document: emptyStudioDocument(),
      targetRole: '',
      focus: 'basics',
    })
    .returning();
  if (!row) throw new Error('策划会话写入后读不到');
  return toRow(row);
}

export async function deleteStudioSession(userId: string, sessionId: string): Promise<boolean> {
  const rows = await getDb()
    .delete(studioSessions)
    .where(and(eq(studioSessions.userId, userId), eq(studioSessions.id, sessionId)))
    .returning({ id: studioSessions.id });
  return rows.length > 0;
}

export async function getStudioSession(userId: string, sessionId: string): Promise<StudioSessionRow | null> {
  const [row] = await getDb()
    .select()
    .from(studioSessions)
    .where(and(eq(studioSessions.userId, userId), eq(studioSessions.id, sessionId)));
  return row ? toRow(row) : null;
}

export async function listStudioSessions(userId: string, limit = 20): Promise<StudioSummary[]> {
  const rows = await getDb()
    .select()
    .from(studioSessions)
    .where(eq(studioSessions.userId, userId))
    .orderBy(desc(studioSessions.updatedAt))
    .limit(limit);
  return rows.map((row) => toStudioSummary(toRow(row)));
}

export async function saveStudioSession(input: {
  userId: string;
  sessionId: string;
  document: StudioDocument;
  targetRole: string;
  focus: StudioFocus;
  status: StudioStatus;
}): Promise<void> {
  await getDb()
    .update(studioSessions)
    .set({
      document: input.document,
      targetRole: input.targetRole,
      focus: input.focus,
      status: input.status,
      updatedAt: new Date(),
    })
    .where(and(eq(studioSessions.userId, input.userId), eq(studioSessions.id, input.sessionId)));
}

const turnSelect = {
  id: studioTurns.id,
  seq: studioTurns.seq,
  role: studioTurns.role,
  content: studioTurns.content,
  idempotencyKey: studioTurns.idempotencyKey,
};

export async function listStudioTurns(userId: string, sessionId: string): Promise<StudioTurnRow[]> {
  return getDb()
    .select(turnSelect)
    .from(studioTurns)
    .where(and(eq(studioTurns.userId, userId), eq(studioTurns.sessionId, sessionId)))
    .orderBy(asc(studioTurns.seq));
}

export async function findStudioTurnByIdempotency(
  userId: string,
  sessionId: string,
  idempotencyKey: string,
): Promise<StudioTurnRow | null> {
  const [row] = await getDb()
    .select(turnSelect)
    .from(studioTurns)
    .where(
      and(
        eq(studioTurns.userId, userId),
        eq(studioTurns.sessionId, sessionId),
        eq(studioTurns.idempotencyKey, idempotencyKey),
      ),
    );
  return row ?? null;
}

export async function findFollowingStudioAssistant(
  userId: string,
  sessionId: string,
  seq: number,
): Promise<StudioTurnRow | null> {
  const [row] = await getDb()
    .select(turnSelect)
    .from(studioTurns)
    .where(
      and(
        eq(studioTurns.userId, userId),
        eq(studioTurns.sessionId, sessionId),
        gt(studioTurns.seq, seq),
        eq(studioTurns.role, 'assistant'),
      ),
    )
    .orderBy(asc(studioTurns.seq))
    .limit(1);
  return row ?? null;
}

async function nextSeq(userId: string, sessionId: string): Promise<number> {
  const [row] = await getDb()
    .select({ max: sql<number>`coalesce(max(${studioTurns.seq}), 0)::int` })
    .from(studioTurns)
    .where(and(eq(studioTurns.userId, userId), eq(studioTurns.sessionId, sessionId)));
  return Number(row?.max ?? 0) + 1;
}

export async function insertStudioUserTurn(input: {
  userId: string;
  sessionId: string;
  content: string;
  idempotencyKey: string;
}): Promise<StudioTurnRow> {
  const id = newId();
  const seq = await nextSeq(input.userId, input.sessionId);
  const [row] = await getDb()
    .insert(studioTurns)
    .values({
      id,
      userId: input.userId,
      sessionId: input.sessionId,
      seq,
      role: 'user',
      content: input.content,
      idempotencyKey: input.idempotencyKey,
    })
    .returning(turnSelect);
  if (!row) throw new Error('策划回复写入后读不到');
  return row;
}

export async function insertStudioAssistantTurn(input: {
  userId: string;
  sessionId: string;
  content: string;
}): Promise<void> {
  const seq = await nextSeq(input.userId, input.sessionId);
  await getDb().insert(studioTurns).values({
    id: newId(),
    userId: input.userId,
    sessionId: input.sessionId,
    seq,
    role: 'assistant',
    content: input.content,
  });
}
