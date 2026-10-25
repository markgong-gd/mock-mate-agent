/**
 * @file 【后端·db】题库仓储
 * 题目是全局数据，没有 user_id。导入按 id upsert；正文变了才清空向量，这样重复 seed 不会把已经算好的向量丢掉。
 */
import { and, asc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type { QuestionSeed } from '@/shared/schemas/question';
import { getDb } from '../client';
import { questions } from '../schema';

export function toSearchText(
  seed: Pick<QuestionSeed, 'content' | 'answerPoints' | 'skillTags' | 'searchText'>,
): string {
  const text =
    seed.searchText?.trim() ||
    `${seed.content}\n${seed.answerPoints.join('\n')}\n${seed.skillTags.join(' ')}`;
  return text.slice(0, 4000);
}

export async function upsertQuestions(seeds: readonly QuestionSeed[]): Promise<{ upserted: number }> {
  const db = getDb();
  for (let i = 0; i < seeds.length; i += 40) {
    const values = seeds.slice(i, i + 40).map((seed) => ({
      id: seed.id,
      content: seed.content,
      answerPoints: [...seed.answerPoints],
      skillTags: [...seed.skillTags],
      difficulty: seed.difficulty,
      type: seed.type,
      source: seed.source,
      license: seed.license,
      searchText: toSearchText(seed),
    }));
    if (values.length === 0) continue;
    await db
      .insert(questions)
      .values(values)
      .onConflictDoUpdate({
        target: questions.id,
        set: {
          content: sql`excluded.content`,
          answerPoints: sql`excluded.answer_points`,
          skillTags: sql`excluded.skill_tags`,
          difficulty: sql`excluded.difficulty`,
          type: sql`excluded.type`,
          source: sql`excluded.source`,
          license: sql`excluded.license`,
          searchText: sql`excluded.search_text`,
          embedding: sql`case when questions.content is distinct from excluded.content or questions.search_text is distinct from excluded.search_text then null else questions.embedding end`,
          embedModel: sql`case when questions.content is distinct from excluded.content or questions.search_text is distinct from excluded.search_text then null else questions.embed_model end`,
        },
      });
  }
  return { upserted: seeds.length };
}

export async function listQuestionsNeedingEmbed(embedModel: string, limit: number) {
  return getDb()
    .select({ id: questions.id, searchText: questions.searchText })
    .from(questions)
    .where(
      or(isNull(questions.embedding), isNull(questions.embedModel), ne(questions.embedModel, embedModel)),
    )
    .orderBy(asc(questions.id))
    .limit(limit);
}

export async function writeQuestionEmbedding(input: { id: string; embedding: number[]; embedModel: string }) {
  await getDb()
    .update(questions)
    .set({ embedding: input.embedding, embedModel: input.embedModel })
    .where(
      and(
        eq(questions.id, input.id),
        or(
          isNull(questions.embedModel),
          ne(questions.embedModel, input.embedModel),
          isNull(questions.embedding),
        ),
      ),
    );
}

export interface QuestionBrief {
  id: string;
  content: string;
  answerPoints: string[];
  skillTags: string[];
}

/** 诊断逐题打分要题干和参考要点。按 id 一次取回，返回 Map 便于配对 */
export async function getQuestionsByIds(ids: readonly string[]): Promise<Map<string, QuestionBrief>> {
  if (ids.length === 0) return new Map();
  const rows = await getDb()
    .select({
      id: questions.id,
      content: questions.content,
      answerPoints: questions.answerPoints,
      skillTags: questions.skillTags,
    })
    .from(questions)
    .where(inArray(questions.id, [...new Set(ids)]));
  return new Map(rows.map((row) => [row.id, row]));
}

export async function countQuestions(): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(questions);
  return Number(row?.n ?? 0);
}
