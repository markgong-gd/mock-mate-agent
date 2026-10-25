/**
 * @file 【测试】recall@k：命中比例与平均
 */
import { describe, expect, it } from 'vitest';
import { meanRecallAtK, recallAtK } from './recall';

describe('recallAtK', () => {
  it('只看前 k 条', () => {
    expect(recallAtK(['a', 'b'], ['a', 'c', 'b'], 1)).toBe(0.5);
    expect(recallAtK(['a', 'b'], ['a', 'c', 'b'], 3)).toBe(1);
  });

  it('没有期望 id 时记为完全命中，避免空样本拉低平均', () => {
    expect(recallAtK([], ['a'], 5)).toBe(1);
  });

  it('平均的是每条样本自己的 recall', () => {
    expect(
      meanRecallAtK(
        [
          { expected: ['a'], retrieved: ['a'] },
          { expected: ['b'], retrieved: ['c'] },
        ],
        5,
      ),
    ).toBe(0.5);
  });
});
