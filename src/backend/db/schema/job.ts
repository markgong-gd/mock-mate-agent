/**
 * @file 【后端·db】目标岗位
 * job_targets 存脱敏后的 JD 原文，方便回看。要求拆到 job_requirements：匹配要按行算，不适合整段 jsonb。
 */
import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

export const jobTargets = pgTable(
  'job_targets',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    company: text('company'),
    summary: text('summary').notNull(),
    /** 脱敏后的 JD。再次发送给模型前仍会走 redact。 */
    rawText: text('raw_text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('job_targets_user_created_idx').on(t.userId, t.createdAt.desc())],
);

export const jobRequirements = pgTable(
  'job_requirements',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    jobTargetId: uuid('job_target_id')
      .notNull()
      .references(() => jobTargets.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    tag: text('tag').notNull(),
    importance: text('importance', { enum: ['must', 'nice'] }).notNull(),
    description: text('description').notNull(),
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => [index('job_requirements_job_idx').on(t.jobTargetId, t.sortOrder)],
);
