/**
 * @file 【后端·db】题库
 * 全局数据，不含用户。embedding 可空：先导入题目，embed-questions 再补向量。
 * 索引按 02 §7.1：向量 HNSW、技能标签 GIN、search_text 的 pg_trgm GIN。
 */
import { index, jsonb, pgTable, smallint, text, vector } from 'drizzle-orm/pg-core';
import { EMBEDDING_DIM } from '@/shared/schemas/embedding';

export const questions = pgTable(
  'questions',
  {
    id: text('id').primaryKey(),
    content: text('content').notNull(),
    answerPoints: jsonb('answer_points').$type<string[]>().notNull(),
    skillTags: text('skill_tags').array().notNull(),
    difficulty: smallint('difficulty').notNull(),
    type: text('type').notNull(),
    source: text('source').notNull(),
    license: text('license').notNull(),
    searchText: text('search_text').notNull(),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIM }),
    embedModel: text('embed_model'),
  },
  (t) => [
    index('questions_embedding_hnsw').using('hnsw', t.embedding.op('vector_cosine_ops')),
    index('questions_skill_tags_gin').using('gin', t.skillTags),
    index('questions_search_trgm').using('gin', t.searchText.op('gin_trgm_ops')),
    index('questions_difficulty_idx').on(t.difficulty),
  ],
);
