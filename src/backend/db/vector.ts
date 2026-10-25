/**
 * @file 【后端·db】事实向量检索 SQL
 * 做什么：按余弦距离取某用户、当前 embed_model 的事实。
 * 为什么手写 SQL：`<=>` 是 pgvector 的距离运算符，Drizzle 里没有同等可读的写法。
 * 硬约束：WHERE 必须有 user_id。漏掉就会把别人的经历召回进简历。
 */
import { EMBEDDING_DIM } from '@/shared/schemas/embedding';
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
