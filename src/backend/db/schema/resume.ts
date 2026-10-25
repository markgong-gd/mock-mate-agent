/**
 * @file 【后端·db】定制简历
 * 同一岗位可以有多个 version。content 是整份简历的 jsonb（含 factRefs），读写都过 Zod。
 * 版本只增不改：编辑和重新生成都插入新行，失败时上一版还在（N-9）。
 */
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { ResumeContent } from '@/shared/schemas/resume';
import { jobTargets } from './job';
import { users } from './users';

export const resumes = pgTable(
  'resumes',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    jobTargetId: uuid('job_target_id')
      .notNull()
      .references(() => jobTargets.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    template: text('template').notNull().default('classic'),
    content: jsonb('content').$type<ResumeContent>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('resumes_job_version_idx').on(t.jobTargetId, t.version),
    index('resumes_user_created_idx').on(t.userId, t.createdAt.desc()),
  ],
);
