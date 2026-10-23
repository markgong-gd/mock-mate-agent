/**
 * @file 【后端·db】llm_calls 仓储：insertLlmCall / listRecentLlmCalls（查询强制带 userId）
 */
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../client';
import { llmCalls } from '../schema';

export type NewLlmCall = typeof llmCalls.$inferInsert;
export type LlmCallRow = typeof llmCalls.$inferSelect;

export async function insertLlmCall(row: NewLlmCall): Promise<void> {
  await getDb().insert(llmCalls).values(row);
}

/** 所有查询强制带 userId（02 §8.3） */
export async function listRecentLlmCalls(
  userId: string,
  opts: { limit?: number; sessionId?: string } = {},
): Promise<LlmCallRow[]> {
  const where = opts.sessionId
    ? and(eq(llmCalls.userId, userId), eq(llmCalls.sessionId, opts.sessionId))
    : eq(llmCalls.userId, userId);
  return getDb()
    .select()
    .from(llmCalls)
    .where(where)
    .orderBy(desc(llmCalls.createdAt))
    .limit(opts.limit ?? 20);
}
