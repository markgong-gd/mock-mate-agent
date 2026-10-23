/**
 * @file 【后端·db】llm_calls 表：每次模型调用的用量元数据（token、耗时、模型、functionId），不存正文
 */
import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

/** 模型调用用量：只记录元数据，不记录 Prompt / 输出正文（02 §5.6） */
export const llmCalls = pgTable(
  'llm_calls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionId: text('session_id'),
    requestId: text('request_id'),
    functionId: text('function_id').notNull(),
    promptVersion: text('prompt_version'),
    alias: text('alias'),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    latencyMs: integer('latency_ms').notNull(),
    firstTokenMs: integer('first_token_ms'),
    status: text('status', { enum: ['ok', 'error'] }).notNull(),
    errorType: text('error_type'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('llm_calls_user_created_idx').on(t.userId, t.createdAt.desc()),
    index('llm_calls_session_idx').on(t.sessionId),
  ],
);
