/**
 * @file 【测试】诊断聚合：加权总分、缺维度、空输入、技能排序
 */
import { describe, expect, it } from 'vitest';
import { aggregate, type AggregateDimension } from '@/shared/domain/diagnosis/aggregate';

const dimensions: AggregateDimension[] = [
  { key: 'tech_depth', label: '技术深度', weight: 0.4 },
  { key: 'structure', label: '结构化表达', weight: 0.2 },
  { key: 'job_fit', label: '岗位匹配度', weight: 0.25 },
  { key: 'communication', label: '沟通流畅度', weight: 0.15 },
];

const full = (scores: [number, number, number, number], skillTags: string[] = ['react']) => ({
  dimensions: [
    { key: 'tech_depth', score: scores[0] },
    { key: 'structure', score: scores[1] },
    { key: 'job_fit', score: scores[2] },
    { key: 'communication', score: scores[3] },
  ],
  skillTags,
});

describe('aggregate', () => {
  it('没有可打分的回答时，总分和维度分都是 0', () => {
    const result = aggregate({ dimensions, answers: [] });
    expect(result.overall).toBe(0);
    expect(result.dimensions.map((d) => d.score)).toEqual([0, 0, 0, 0]);
    expect(result.skills).toEqual([]);
    expect(result.answerScores).toEqual([]);
  });

  it('单题：总分等于各维度按权重的加权平均', () => {
    const result = aggregate({ dimensions, answers: [full([5, 3, 4, 2])] });
    // 5*0.4 + 3*0.2 + 4*0.25 + 2*0.15 = 3.9
    expect(result.overall).toBe(3.9);
    expect(result.answerScores).toEqual([3.9]);
  });

  it('多题：维度分先在题目间取均值，再按权重合成总分', () => {
    const result = aggregate({ dimensions, answers: [full([5, 5, 5, 5]), full([1, 1, 1, 1])] });
    expect(result.dimensions.map((d) => d.score)).toEqual([3, 3, 3, 3]);
    expect(result.overall).toBe(3);
  });

  it('维度顺序与 Rubric 一致，权重原样带出', () => {
    const result = aggregate({ dimensions, answers: [full([4, 4, 4, 4])] });
    expect(result.dimensions.map((d) => d.key)).toEqual([
      'tech_depth',
      'structure',
      'job_fit',
      'communication',
    ]);
    expect(result.dimensions.map((d) => d.weight)).toEqual([0.4, 0.2, 0.25, 0.15]);
  });

  it('某个维度一题都没打到分时，它记 0 分但不拉低总分', () => {
    const result = aggregate({
      dimensions,
      answers: [
        {
          dimensions: [
            { key: 'tech_depth', score: 4 },
            { key: 'structure', score: 4 },
          ],
          skillTags: [],
        },
      ],
    });
    expect(result.dimensions.find((d) => d.key === 'job_fit')?.score).toBe(0);
    expect(result.overall).toBe(4);
  });

  it('Rubric 里没有的维度被忽略', () => {
    const result = aggregate({
      dimensions,
      answers: [
        {
          dimensions: [
            { key: 'voice_pace', score: 1 },
            { key: 'tech_depth', score: 5 },
          ],
          skillTags: [],
        },
      ],
    });
    expect(result.overall).toBe(5);
    expect(result.dimensions.some((d) => d.key === 'voice_pace')).toBe(false);
  });

  it('技能分按标签摊分，最差的排最前面', () => {
    const result = aggregate({
      dimensions,
      answers: [full([5, 5, 5, 5], ['react', 'state']), full([1, 1, 1, 1], ['performance'])],
    });
    expect(result.skills.map((s) => s.tag)).toEqual(['performance', 'react', 'state']);
    expect(result.skills[0]).toEqual({ tag: 'performance', score: 1, count: 1 });
    expect(result.skills.find((s) => s.tag === 'react')).toEqual({ tag: 'react', score: 5, count: 1 });
  });

  it('同一个技能出现在多题时取均值并记次数', () => {
    const result = aggregate({
      dimensions,
      answers: [full([5, 5, 5, 5], ['react']), full([2, 2, 2, 2], ['react'])],
    });
    expect(result.skills).toEqual([{ tag: 'react', score: 3.5, count: 2 }]);
  });

  it('权重全为 0 时退化成算术平均，不会除以 0', () => {
    const zero = dimensions.map((d) => ({ ...d, weight: 0 }));
    const result = aggregate({ dimensions: zero, answers: [full([1, 2, 3, 4])] });
    expect(result.overall).toBe(2.5);
  });
});
