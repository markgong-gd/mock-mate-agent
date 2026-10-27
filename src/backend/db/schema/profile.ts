/**
 * @file 【后端·db】职业档案表
 * profiles 与 users 一对一。experiences / facts / skills 都带 user_id，删用户时级联删除。
 * 联系方式是普通列，不进抽取 Prompt。facts.embedding 可空：先存事实，embed-facts 再补向量。
 * 技能放在 skills.tag（封闭目录），不放在 fact 上：匹配看的是人会什么，不是某一句话的标签。
 */
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid, vector } from 'drizzle-orm/pg-core';
import { EMBEDDING_DIM } from '@/shared/schemas/embedding';
import { users } from './users';

const userId = () =>
  uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  userId: userId().unique(),
  name: text('name').notNull(),
  headline: text('headline').notNull(),
  summary: text('summary').notNull(),
  phone: text('phone'),
  email: text('email'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const experiences = pgTable(
  'experiences',
  {
    id: uuid('id').primaryKey(),
    userId: userId(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    company: text('company').notNull(),
    title: text('title').notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date'),
    summary: text('summary').notNull(),
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => [index('experiences_user_idx').on(t.userId, t.sortOrder)],
);

export const facts = pgTable(
  'facts',
  {
    id: uuid('id').primaryKey(),
    userId: userId(),
    experienceId: uuid('experience_id')
      .notNull()
      .references(() => experiences.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIM }),
    embedModel: text('embed_model'),
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => [
    index('facts_user_idx').on(t.userId),
    index('facts_embed_model_idx').on(t.userId, t.embedModel),
    index('facts_embedding_hnsw').using('hnsw', t.embedding.op('vector_cosine_ops')),
  ],
);

export const skills = pgTable(
  'skills',
  {
    id: uuid('id').primaryKey(),
    userId: userId(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tag: text('tag').notNull(),
    /** used / proficient / expert。旧数据迁移时填 used */
    level: text('level').notNull().default('used'),
    evidenceFactIds: uuid('evidence_fact_ids').array().notNull().default([]),
  },
  (t) => [uniqueIndex('skills_user_tag_idx').on(t.userId, t.tag)],
);
