/**
 * @file 【后端·db】users 表：所有用户数据的根，其它用户表通过 user_id 外键级联删除
 */
import { pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
