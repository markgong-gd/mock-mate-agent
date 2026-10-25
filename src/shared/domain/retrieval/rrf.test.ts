/**
 * @file 【测试】RRF：两路都出现的条目排在只出现一路的前面
 */
import { describe, expect, it } from 'vitest';
import { reciprocalRankFusion } from './rrf';

describe('reciprocalRankFusion', () => {
  it('合并名次，同一路里的重复 id 只计一次', () => {
    const fused = reciprocalRankFusion(
      [
        [
          { id: 'b', label: 'from-vector' },
          { id: 'a', label: 'from-vector' },
        ],
        [
          { id: 'a', label: 'from-keyword' },
          { id: 'a', label: 'duplicate' },
          { id: 'c', label: 'from-keyword' },
        ],
      ],
      60,
    );
    expect(fused.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(fused[0]?.score).toBeCloseTo(1 / 61 + 1 / 61);
    expect(fused[0]?.label).toBe('from-vector');
  });

  it('空列表得到空结果', () => {
    expect(reciprocalRankFusion([[], []])).toEqual([]);
  });
});
