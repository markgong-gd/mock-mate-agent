/**
 * @file 【后端·db】模拟面试会话和轮次
 * sessions 带 user_id，删用户时级联删除。mode / kind 先给出文字面试和普通场，语音和专项训练后面复用这张表。
 * turns.idempotency_key 只在用户回答上有值。Postgres 的唯一索引把 NULL 当成互不相同，所以面试官轮次可以不填。
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { InterviewSettings } from '@/shared/schemas/interview';
import { jobTargets } from './job';
import { questions } from './question';
import { users } from './users';

export const interviewSessions = pgTable(
  'interview_sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    jobTargetId: uuid('job_target_id')
      .notNull()
      .references(() => jobTargets.id, { onDelete: 'cascade' }),
    mode: text('mode', { enum: ['text', 'voice'] })
      .notNull()
      .default('text'),
    kind: text('kind', { enum: ['normal', 'drill'] })
      .notNull()
      .default('normal'),
    settings: jsonb('settings').$type<InterviewSettings>().notNull(),
    status: text('status', { enum: ['pending', 'running', 'finished'] })
      .notNull()
      .default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('interview_sessions_user_created_idx').on(t.userId, t.createdAt.desc())],
);

export const interviewTurns = pgTable(
  'interview_turns',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => interviewSessions.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    content: text('content').notNull(),
    questionId: text('question_id').references(() => questions.id, { onDelete: 'set null' }),
    isFollowUp: boolean('is_follow_up').notNull().default(false),
    idempotencyKey: text('idempotency_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('interview_turns_session_seq_idx').on(t.sessionId, t.seq),
    uniqueIndex('interview_turns_session_idem_idx')
      .on(t.sessionId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
    index('interview_turns_session_idx').on(t.sessionId, t.seq),
  ],
);
