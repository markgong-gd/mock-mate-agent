/**
 * @file 【后端·db】对话式简历策划
 * 一场一个当前稿。轮次按 seq 唯一，幂等键只出现在用户消息上。
 */
import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { StudioDocument, StudioFocus, StudioStatus } from '@/shared/schemas/studio';
import { users } from './users';

export const studioSessions = pgTable(
  'studio_sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    status: text('status', { enum: ['active', 'ready'] })
      .$type<StudioStatus>()
      .notNull()
      .default('active'),
    document: jsonb('document').$type<StudioDocument>().notNull(),
    targetRole: text('target_role').notNull().default(''),
    focus: text('focus', {
      enum: ['basics', 'summary', 'skills', 'experience', 'projects', 'education'],
    })
      .$type<StudioFocus>()
      .notNull()
      .default('basics'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('studio_sessions_user_updated_idx').on(t.userId, t.updatedAt.desc())],
);

export const studioTurns = pgTable(
  'studio_turns',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => studioSessions.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    content: text('content').notNull(),
    idempotencyKey: text('idempotency_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('studio_turns_session_seq_idx').on(t.sessionId, t.seq),
    uniqueIndex('studio_turns_session_idem_idx')
      .on(t.sessionId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
    index('studio_turns_session_idx').on(t.sessionId, t.seq),
  ],
);
