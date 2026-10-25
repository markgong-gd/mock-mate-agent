/**
 * @file 【公共·domain】倒数排名融合（RRF）
 * 做什么：把多路召回的名次合成一个分数，1 / (k + rank)。某一路特别自信也不会压过另一路的第一名。
 * k 用 60，是这篇方法里常用的常数。rank 从 1 开始。
 */

export function reciprocalRankFusion<T extends { id: string }>(
  lists: readonly (readonly T[])[],
  k = 60,
): Array<T & { score: number }> {
  const best = new Map<string, T>();
  const scores = new Map<string, number>();
  for (const list of lists) {
    const seen = new Set<string>();
    let rank = 0;
    for (const item of list) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      rank += 1;
      if (!best.has(item.id)) best.set(item.id, item);
      scores.set(item.id, (scores.get(item.id) ?? 0) + 1 / (k + rank));
    }
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id, score]) => ({ ...best.get(id)!, score }));
}
