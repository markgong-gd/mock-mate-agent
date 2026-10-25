/**
 * @file 【公共·domain】档案技能与 JD 要求的缺口
 * 做什么：按标签集合计算命中率、必备项命中率、已匹配项和缺口。
 * 为什么不用向量：这一步要能向用户解释“哪条要求没覆盖”。语义相近但标签不同的情况，
 * 交给确认页改标签，不在这里做模糊匹配。向量检索用在“事实 vs 某条要求”（FactRetriever）。
 */
import type { Requirement } from '@/shared/schemas/job';

export interface SkillGapItem {
  tag: string;
  label: string;
  importance: Requirement['importance'];
}

export interface SkillGap {
  /** 全部要求的命中百分比，0–100 */
  score: number;
  /** 必备项命中百分比；JD 没有必备项时为 null */
  mustScore: number | null;
  matched: SkillGapItem[];
  missing: SkillGapItem[];
}

const norm = (tag: string) => tag.trim().toLowerCase();

export function skillGap(haveTags: readonly string[], requirements: readonly SkillGapItem[]): SkillGap {
  const have = new Set(haveTags.map(norm));
  const matched: SkillGapItem[] = [];
  const missing: SkillGapItem[] = [];
  for (const req of requirements) {
    (have.has(norm(req.tag)) ? matched : missing).push(req);
  }
  const score = requirements.length === 0 ? 0 : Math.round((matched.length / requirements.length) * 100);
  const musts = requirements.filter((r) => r.importance === 'must');
  const mustHit = musts.filter((r) => have.has(norm(r.tag))).length;
  return {
    score,
    mustScore: musts.length === 0 ? null : Math.round((mustHit / musts.length) * 100),
    matched,
    missing,
  };
}
