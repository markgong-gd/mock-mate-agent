/**
 * @file 【公共·domain】词面重合排序
 * 做什么：在还没有向量（或某条要求向量召回为空）时，按查询和事实的 token 重合挑出相关事实。
 * 为什么放在 domain：不访问数据库，简历图和单测都能直接用。
 * 取舍：中文按二字切分，英文按词切分。它不是语义检索，只是向量还没就绪时的退路。
 *       真正的召回仍以 FactRetriever 的余弦距离为准。混合检索（RRF）留到 P2a。
 */

export interface OverlapFact {
  id: string;
  text: string;
  skillTags: readonly string[];
}

export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const words = lower.split(/[^\p{L}\p{N}]+/u).filter((token) => token.length >= 2);
  const compact = lower.replace(/\s+/g, '');
  const grams: string[] = [];
  for (let i = 0; i < compact.length - 1; i++) grams.push(compact.slice(i, i + 2));
  return [...words, ...grams];
}

/** 分数高的在前。分数为 0 的丢掉，避免把毫不相关的事实塞进 Prompt。 */
export function rankByOverlap<T extends OverlapFact>(query: string, facts: readonly T[], k: number): T[] {
  const wanted = new Set(tokenize(query));
  return facts
    .map((fact) => {
      const tokens = tokenize(`${fact.text} ${fact.skillTags.join(' ')}`);
      const score = tokens.reduce((n, token) => n + (wanted.has(token) ? 1 : 0), 0);
      return { fact, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.fact.id.localeCompare(b.fact.id))
    .slice(0, k)
    .map((row) => row.fact);
}
