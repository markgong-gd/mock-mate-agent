/**
 * @file 【公共·domain】把逐题打分聚合成一份报告的分数
 * 维度分 = 该维度在各题上的均分；总分 = 维度分按 Rubric 权重的加权平均（只在有数据的维度上归一化）。
 * 单题分 = 这一题各维度按权重的加权平均，再摊到这题的技能标签上，得到技能分（短板优先用它排序）。
 * 没有可打分的回答时全部返回 0：报告仍然生成，页面显示“本场没有可评分的回答”。
 */

export interface AggregateDimension {
  key: string;
  label: string;
  weight: number;
}

export interface AggregateAnswer {
  dimensions: readonly { key: string; score: number }[];
  skillTags: readonly string[];
}

export interface AggregateInput {
  dimensions: readonly AggregateDimension[];
  answers: readonly AggregateAnswer[];
}

export interface AggregateResult {
  overall: number;
  /** 顺序与传入的 Rubric 维度一致 */
  dimensions: { key: string; label: string; weight: number; score: number }[];
  /** 按分数从低到高：最差的技能排在最前面 */
  skills: { tag: string; score: number; count: number }[];
  /** 与 answers 一一对应的单题加权分 */
  answerScores: number[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

const mean = (values: readonly number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;

/** 只在给定 key 上做加权平均；权重全为 0 时退化为算术平均 */
function weightedMean(
  scores: ReadonlyMap<string, number>,
  dimensions: readonly AggregateDimension[],
): number | null {
  const present = dimensions.filter((d) => scores.has(d.key));
  if (present.length === 0) return null;
  const totalWeight = present.reduce((sum, d) => sum + d.weight, 0);
  if (totalWeight <= 0) return mean(present.map((d) => scores.get(d.key)!));
  return present.reduce((sum, d) => sum + scores.get(d.key)! * d.weight, 0) / totalWeight;
}

export function aggregate(input: AggregateInput): AggregateResult {
  const perDimension = new Map<string, number[]>(input.dimensions.map((d) => [d.key, []]));
  const answerScores: number[] = [];
  const perSkill = new Map<string, number[]>();

  for (const answer of input.answers) {
    const scores = new Map<string, number>();
    for (const item of answer.dimensions) {
      if (!perDimension.has(item.key)) continue; // Rubric 换版本后出现的陌生维度直接忽略
      scores.set(item.key, item.score);
      perDimension.get(item.key)!.push(item.score);
    }
    const score = weightedMean(scores, input.dimensions);
    answerScores.push(score === null ? 0 : round1(score));
    if (score === null) continue;
    for (const tag of answer.skillTags) {
      const bucket = perSkill.get(tag) ?? [];
      bucket.push(score);
      perSkill.set(tag, bucket);
    }
  }

  const dimensions = input.dimensions.map((d) => {
    const values = perDimension.get(d.key) ?? [];
    return {
      key: d.key,
      label: d.label,
      weight: d.weight,
      score: values.length === 0 ? 0 : round1(mean(values)),
    };
  });

  const scored = new Map<string, number>(
    dimensions.filter((d) => (perDimension.get(d.key) ?? []).length > 0).map((d) => [d.key, d.score]),
  );
  const overall = weightedMean(scored, input.dimensions);

  const skills = [...perSkill.entries()]
    .map(([tag, values]) => ({ tag, score: round1(mean(values)), count: values.length }))
    .sort((a, b) => a.score - b.score || a.tag.localeCompare(b.tag));

  return { overall: overall === null ? 0 : round1(overall), dimensions, skills, answerScores };
}
