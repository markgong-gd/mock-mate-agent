/**
 * @file 【后端·db】向量与关键词检索 SQL
 * 事实检索必须带 user_id。题库是全局数据，用技能标签、难度和 embed_model 过滤。
 * 手写 SQL 是因为 `<=>`、`similarity` 和 pg_trgm 的 `%` 在 Drizzle 里不好读。
 */
import { EMBEDDING_DIM } from '@/shared/schemas/embedding';
import type { QuestionType, RetrievedQuestion } from '@/shared/schemas/question';
import type { RetrievedFact } from '@/shared/schemas/resume';
import { getPool } from './client';

export function toVectorLiteral(values: number[]): string {
  if (values.length !== EMBEDDING_DIM || values.some((n) => !Number.isFinite(n))) {
    throw new Error(`向量必须是 ${EMBEDDING_DIM} 维有限数字`);
  }
  return `[${values.join(',')}]`;
}

export async function searchFacts(input: {
  userId: string;
  vector: number[];
  embedModel: string;
  k: number;
}): Promise<RetrievedFact[]> {
  const result = await getPool().query<{
    id: string;
    experience_id: string;
    text: string;
    score: number;
  }>(
    `select id, experience_id, text, 1 - (embedding <=> $1::vector) as score
     from facts
     where user_id = $2
       and embed_model = $3
       and embedding is not null
     order by embedding <=> $1::vector
     limit $4`,
    [toVectorLiteral(input.vector), input.userId, input.embedModel, input.k],
  );
  return result.rows.map((row) => ({
    id: row.id,
    experienceId: row.experience_id,
    text: row.text,
    score: Number(row.score),
  }));
}

interface QuestionFilter {
  skills: string[];
  difficultyMin: number;
  difficultyMax: number;
  types?: QuestionType[];
  k: number;
}

interface QuestionRow {
  id: string;
  content: string;
  answer_points: string[] | null;
  skill_tags: string[] | null;
  difficulty: number;
  type: string;
  score?: number;
}

function mapQuestion(row: QuestionRow, score: number): RetrievedQuestion {
  const type = (['concept', 'scenario', 'project', 'behavior'] as const).includes(row.type as QuestionType)
    ? (row.type as QuestionType)
    : 'concept';
  return {
    id: row.id,
    content: row.content,
    answerPoints: Array.isArray(row.answer_points) ? row.answer_points : [],
    skillTags: Array.isArray(row.skill_tags) ? row.skill_tags : [],
    difficulty: Number(row.difficulty),
    type,
    score,
  };
}

const TYPE_CLAUSE = 'and (coalesce(cardinality($types::text[]), 0) = 0 or type = any($types::text[]))';

/** 把 $types 这种名字换成 pg 的位置参数。手写 SQL 时用名字，避免数 $1 $2 数错 */
function bind(sql: string, names: Record<string, unknown>): { text: string; values: unknown[] } {
  const values: unknown[] = [];
  const text = sql.replaceAll(/\$([a-zA-Z0-9_]+)/g, (_all, name: string) => {
    if (!(name in names)) throw new Error(`SQL 缺少参数 ${name}`);
    values.push(names[name]);
    return `$${values.length}`;
  });
  return { text, values };
}

export async function searchQuestionsByVector(
  input: QuestionFilter & { vector: number[]; embedModel: string },
): Promise<RetrievedQuestion[]> {
  if (input.skills.length === 0) return [];
  const query = bind(
    `select id, content, answer_points, skill_tags, difficulty, type,
            1 - (embedding <=> $vector::vector) as score
     from questions
     where embed_model = $embedModel
       and embedding is not null
       and skill_tags && $skills::text[]
       and difficulty between $difficultyMin and $difficultyMax
       ${TYPE_CLAUSE}
     order by embedding <=> $vector::vector
     limit $k`,
    {
      vector: toVectorLiteral(input.vector),
      embedModel: input.embedModel,
      skills: input.skills,
      difficultyMin: input.difficultyMin,
      difficultyMax: input.difficultyMax,
      types: input.types ?? null,
      k: input.k,
    },
  );
  const result = await getPool().query<QuestionRow>(query.text, query.values);
  return result.rows.map((row) => mapQuestion(row, Number(row.score)));
}

export function keywordLikePattern(keyword: string): string {
  const escaped = keyword.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  return `%${escaped}%`;
}

/**
 * 关键词路：pg_trgm 的 `%` 能用 GIN 索引，中文短词常常够不到默认相似度，
 * 所以同时用技能标签的 ILIKE 把这一标签下的题纳入候选，再按 similarity 排序。
 */
export async function searchQuestionsByKeyword(
  input: QuestionFilter & { keyword: string; like: string },
): Promise<RetrievedQuestion[]> {
  if (input.skills.length === 0 || !input.keyword.trim()) return [];
  const query = bind(
    `select id, content, answer_points, skill_tags, difficulty, type,
            similarity(search_text, $keyword) as score
     from questions
     where skill_tags && $skills::text[]
       and difficulty between $difficultyMin and $difficultyMax
       ${TYPE_CLAUSE}
       and (
         search_text % $keyword
         or search_text ilike $like escape '\\'
       )
     order by similarity(search_text, $keyword) desc, id
     limit $k`,
    {
      keyword: input.keyword,
      like: keywordLikePattern(input.like),
      skills: input.skills,
      difficultyMin: input.difficultyMin,
      difficultyMax: input.difficultyMax,
      types: input.types ?? null,
      k: input.k,
    },
  );
  const result = await getPool().query<QuestionRow>(query.text, query.values);
  return result.rows.map((row) => mapQuestion(row, Number(row.score)));
}

/** 向量还没写好时的退路：先按标签和难度把候选捞出来，调用方再用词面重合排序 */
export async function listQuestionsBySkills(
  input: Omit<QuestionFilter, 'k'> & { limit: number },
): Promise<RetrievedQuestion[]> {
  if (input.skills.length === 0) return [];
  const query = bind(
    `select id, content, answer_points, skill_tags, difficulty, type, 0 as score
     from questions
     where skill_tags && $skills::text[]
       and difficulty between $difficultyMin and $difficultyMax
       ${TYPE_CLAUSE}
     order by difficulty, id
     limit $limit`,
    {
      skills: input.skills,
      difficultyMin: input.difficultyMin,
      difficultyMax: input.difficultyMax,
      types: input.types ?? null,
      limit: input.limit,
    },
  );
  const result = await getPool().query<QuestionRow>(query.text, query.values);
  return result.rows.map((row) => mapQuestion(row, 0));
}
