/**
 * @file 【后端·db】单独同意
 * 一行 = 某用户对某个用途的某个文案版本点了同意。升版本后旧行不算数，必须重新同意。
 */
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

export const consents = pgTable(
  'consents',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull(),
    version: text('version').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('consents_user_purpose_version_idx').on(t.userId, t.purpose, t.version),
    index('consents_user_idx').on(t.userId),
  ],
);
