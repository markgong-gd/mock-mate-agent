/**
 * @file 【后端·db】llm_calls 仓储：insertLlmCall / listRecentLlmCalls / 按会话聚合（查询强制带 userId）
 * 聚合只到"模型 + functionId + token"这一层，钱在 core 里用 agent/llm/pricing 现算（单价不落库）。
 */
import { and, desc, eq, sql } from 'drizzle-orm';
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

/** 一场面试的用量按「functionId × 模型」分组。provider / model 要留着给 pricing 查单价 */
export interface SessionUsageRow {
  functionId: string;
  provider: string;
  model: string;
  calls: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export async function sumSessionUsage(userId: string, sessionId: string): Promise<SessionUsageRow[]> {
  return getDb()
    .select({
      functionId: llmCalls.functionId,
      provider: llmCalls.provider,
      model: llmCalls.model,
      calls: sql<number>`count(*)::int`.mapWith(Number),
      errors: sql<number>`count(*) filter (where ${llmCalls.status} = 'error')::int`.mapWith(Number),
      inputTokens: sql<number>`coalesce(sum(${llmCalls.inputTokens}), 0)::int`.mapWith(Number),
      outputTokens: sql<number>`coalesce(sum(${llmCalls.outputTokens}), 0)::int`.mapWith(Number),
      latencyMs: sql<number>`coalesce(sum(${llmCalls.latencyMs}), 0)::int`.mapWith(Number),
    })
    .from(llmCalls)
    .where(and(eq(llmCalls.userId, userId), eq(llmCalls.sessionId, sessionId)))
    .groupBy(llmCalls.functionId, llmCalls.provider, llmCalls.model)
    .orderBy(llmCalls.functionId, llmCalls.model);
}

/** 预算检查用：只要 token 总数，别把整张表拉回来 */
export async function sumSessionTokens(userId: string, sessionId: string): Promise<number> {
  const [row] = await getDb()
    .select({
      tokens:
        sql<number>`coalesce(sum(coalesce(${llmCalls.inputTokens}, 0) + coalesce(${llmCalls.outputTokens}, 0)), 0)::int`.mapWith(
          Number,
        ),
    })
    .from(llmCalls)
    .where(and(eq(llmCalls.userId, userId), eq(llmCalls.sessionId, sessionId)));
  return row?.tokens ?? 0;
}
