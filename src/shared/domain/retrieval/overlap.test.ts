/**
 * @file 【测试】词面重合：相关事实排在前面，无关事实被丢掉
 */
import { describe, expect, it } from 'vitest';
import { rankByOverlap } from './overlap';

describe('rankByOverlap', () => {
  const facts = [
    { id: 'a', text: '使用 React 完成管理后台的性能优化', skillTags: ['react', 'performance'] },
    { id: 'b', text: '负责公司年会的现场布置', skillTags: [] },
  ];

  it('查询 React 性能时命中相关事实', () => {
    const ranked = rankByOverlap('熟悉 React 性能优化', facts, 4);
    expect(ranked.map((f) => f.id)).toEqual(['a']);
  });
});
