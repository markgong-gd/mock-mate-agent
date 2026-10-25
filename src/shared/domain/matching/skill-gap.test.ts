/**
 * @file 【测试】skillGap：命中、缺口、必备项、空要求
 */
import { describe, expect, it } from 'vitest';
import { skillGap } from './skill-gap';

const reqs = [
  { tag: 'react', label: 'React', importance: 'must' as const },
  { tag: 'typescript', label: 'TypeScript', importance: 'must' as const },
  { tag: 'vue', label: 'Vue', importance: 'nice' as const },
];

describe('skillGap', () => {
  it('按标签计算命中和缺口，多出来的技能不加分也不扣分', () => {
    const gap = skillGap(['React', 'node'], reqs);
    expect(gap.score).toBe(33);
    expect(gap.mustScore).toBe(50);
    expect(gap.matched.map((m) => m.tag)).toEqual(['react']);
    expect(gap.missing.map((m) => m.tag)).toEqual(['typescript', 'vue']);
  });

  it('没有必备项时 mustScore 为 null', () => {
    const gap = skillGap(['vue'], [{ tag: 'vue', label: 'Vue', importance: 'nice' }]);
    expect(gap.score).toBe(100);
    expect(gap.mustScore).toBeNull();
    expect(gap.missing).toEqual([]);
  });

  it('没有要求时分数为 0', () => {
    expect(skillGap(['react'], []).score).toBe(0);
  });
});
