/**
 * @file 【公共·domain】从召回结果里分配一场面试的题目
 * 顺序：短板优先 → 技能覆盖（同一技能不重复占坑，除非没有别的技能了）→ 组内难度从低到高。
 * 短板题整组放在前面。还没写回短板时 weaknessTags 为空，就只做覆盖和难度梯度。
 */
import type { QueuedQuestion, RetrievedQuestion } from '@/shared/schemas/question';

export interface AllocateInput {
  candidates: readonly RetrievedQuestion[];
  count: number;
  weaknessTags: readonly string[];
  difficultyMin: number;
  difficultyMax: number;
}

interface Marked extends RetrievedQuestion {
  weaknessMatch: boolean;
}

export function allocate(input: AllocateInput): QueuedQuestion[] {
  if (input.count <= 0) return [];
  const weakness = new Set(input.weaknessTags);
  const byId = new Map<string, Marked>();
  for (const candidate of input.candidates) {
    if (candidate.difficulty < input.difficultyMin || candidate.difficulty > input.difficultyMax) continue;
    const marked: Marked = {
      ...candidate,
      weaknessMatch: candidate.skillTags.some((tag) => weakness.has(tag)),
    };
    const prev = byId.get(candidate.id);
    if (!prev || marked.score > prev.score) byId.set(candidate.id, marked);
  }

  const remaining = [...byId.values()];
  const picked: Marked[] = [];
  const covered = new Set<string>();
  const usedDifficulty = new Set<number>();

  while (picked.length < input.count && remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i]!;
      const newSkills = candidate.skillTags.filter((tag) => !covered.has(tag)).length;
      const score =
        (candidate.weaknessMatch ? 1000 : 0) +
        newSkills * 100 +
        (usedDifficulty.has(candidate.difficulty) ? 0 : 30) +
        candidate.score;
      const best = remaining[bestIndex]!;
      const better = score > bestScore || (score === bestScore && candidate.id.localeCompare(best.id) < 0);
      if (better) {
        bestScore = score;
        bestIndex = i;
      }
    }
    const chosen = remaining.splice(bestIndex, 1)[0]!;
    picked.push(chosen);
    for (const tag of chosen.skillTags) covered.add(tag);
    usedDifficulty.add(chosen.difficulty);
  }

  const byDifficulty = (a: Marked, b: Marked) => a.difficulty - b.difficulty || a.id.localeCompare(b.id);
  const weaknessFirst = picked.filter((item) => item.weaknessMatch).sort(byDifficulty);
  const rest = picked.filter((item) => !item.weaknessMatch).sort(byDifficulty);
  return [...weaknessFirst, ...rest].map(({ score: _score, ...item }) => item);
}
