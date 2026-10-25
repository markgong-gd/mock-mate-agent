/**
 * @file 【公共·domain】recall@k
 * 命中数 / 期望数。期望为空时记 1，避免没有标准答案的样本把平均分拉成 0。
 */

export function recallAtK(expected: readonly string[], retrieved: readonly string[], k: number): number {
  if (expected.length === 0) return 1;
  const top = new Set(retrieved.slice(0, Math.max(0, k)));
  const hit = expected.filter((id) => top.has(id)).length;
  return hit / expected.length;
}

export function meanRecallAtK(
  cases: readonly { expected: readonly string[]; retrieved: readonly string[] }[],
  k: number,
): number {
  if (cases.length === 0) return 0;
  const total = cases.reduce((sum, item) => sum + recallAtK(item.expected, item.retrieved, k), 0);
  return total / cases.length;
}
