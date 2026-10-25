/**
 * @file 【测试】出题分配：短板优先、技能覆盖、难度梯度、去重、难度过滤
 */
import { describe, expect, it } from 'vitest';
import type { RetrievedQuestion } from '@/shared/schemas/question';
import { allocate } from './allocate';

function q(
  partial: Partial<RetrievedQuestion> & Pick<RetrievedQuestion, 'id' | 'skillTags' | 'difficulty'>,
): RetrievedQuestion {
  return {
    content: partial.id,
    answerPoints: ['要点'],
    type: 'concept',
    score: 1,
    ...partial,
  };
}

describe('allocate', () => {
  it('短板题排在前面，组内再按难度从低到高', () => {
    const result = allocate({
      count: 3,
      weaknessTags: ['testing'],
      difficultyMin: 1,
      difficultyMax: 5,
      candidates: [
        q({ id: 'react-hard', skillTags: ['react'], difficulty: 5, score: 50 }),
        q({ id: 'test-hard', skillTags: ['testing'], difficulty: 4, score: 1 }),
        q({ id: 'test-easy', skillTags: ['testing'], difficulty: 1, score: 1 }),
      ],
    });
    expect(result.map((item) => item.id)).toEqual(['test-easy', 'test-hard', 'react-hard']);
    expect(result[0]?.weaknessMatch).toBe(true);
    expect(result[2]?.weaknessMatch).toBe(false);
  });

  it('短板题够用时不会为了别的技能把短板挤掉', () => {
    const result = allocate({
      count: 2,
      weaknessTags: ['css'],
      difficultyMin: 1,
      difficultyMax: 5,
      candidates: [
        q({ id: 'css-1', skillTags: ['css'], difficulty: 2, score: 1 }),
        q({ id: 'css-2', skillTags: ['css'], difficulty: 3, score: 1 }),
        q({ id: 'js-1', skillTags: ['javascript'], difficulty: 1, score: 100 }),
      ],
    });
    expect(result.map((item) => item.id)).toEqual(['css-1', 'css-2']);
  });

  it('没有短板时，优先覆盖还没出现的技能，而不是同一技能的高分题', () => {
    const result = allocate({
      count: 2,
      weaknessTags: [],
      difficultyMin: 1,
      difficultyMax: 5,
      candidates: [
        q({ id: 'react-a', skillTags: ['react'], difficulty: 2, score: 10 }),
        q({ id: 'react-b', skillTags: ['react'], difficulty: 3, score: 9 }),
        q({ id: 'css-a', skillTags: ['css'], difficulty: 4, score: 1 }),
      ],
    });
    expect(result.map((item) => item.id)).toEqual(['react-a', 'css-a']);
  });

  it('同一组内难度从低到高，形成梯度', () => {
    const result = allocate({
      count: 3,
      weaknessTags: [],
      difficultyMin: 1,
      difficultyMax: 5,
      candidates: [
        q({ id: 'c', skillTags: ['react'], difficulty: 5, score: 1 }),
        q({ id: 'a', skillTags: ['css'], difficulty: 1, score: 1 }),
        q({ id: 'b', skillTags: ['typescript'], difficulty: 3, score: 1 }),
      ],
    });
    expect(result.map((item) => item.difficulty)).toEqual([1, 3, 5]);
  });

  it('丢掉难度范围外的题，并按 id 去重留下分数更高的一条', () => {
    const result = allocate({
      count: 5,
      weaknessTags: [],
      difficultyMin: 2,
      difficultyMax: 3,
      candidates: [
        q({ id: 'same', skillTags: ['react'], difficulty: 2, score: 1 }),
        q({ id: 'same', skillTags: ['react'], difficulty: 2, score: 5 }),
        q({ id: 'too-easy', skillTags: ['css'], difficulty: 1, score: 100 }),
        q({ id: 'too-hard', skillTags: ['node'], difficulty: 5, score: 100 }),
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('same');
  });

  it('题不够时有多少返回多少；题数为 0 时返回空', () => {
    const only = [q({ id: 'only', skillTags: ['html'], difficulty: 2, score: 1 })];
    expect(
      allocate({ candidates: only, count: 4, weaknessTags: [], difficultyMin: 1, difficultyMax: 5 }),
    ).toHaveLength(1);
    expect(
      allocate({ candidates: only, count: 0, weaknessTags: [], difficultyMin: 1, difficultyMax: 5 }),
    ).toEqual([]);
  });
});
