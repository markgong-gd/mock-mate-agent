/**
 * @file 【测试】FactRetriever 必须把构造时的 userId 传给查询，不能从参数里另取
 */
import { describe, expect, it } from 'vitest';
import type { RetrievedFact } from '@/shared/schemas/resume';
import { EMBEDDING_DIM } from '@/shared/schemas/embedding';
import { FactRetriever } from './fact-retriever';

describe('FactRetriever', () => {
  it('查询时使用构造函数里的 userId', async () => {
    const seen: string[] = [];
    const hit: RetrievedFact = {
      id: '11111111-1111-4111-8111-111111111111',
      experienceId: '22222222-2222-4222-8222-222222222222',
      text: '做过 React 性能优化',
      score: 0.8,
    };
    const retriever = new FactRetriever('user-a', {
      embedModel: 'fake:ngram-1024',
      embedQuery: async () => new Array(EMBEDDING_DIM).fill(0),
      search: async (input) => {
        seen.push(input.userId);
        expect(input.embedModel).toBe('fake:ngram-1024');
        return [hit];
      },
    });
    await expect(retriever.retrieve('React')).resolves.toEqual([hit]);
    expect(seen).toEqual(['user-a']);
  });

  it('缺少 userId 时直接拒绝构造', () => {
    expect(() => new FactRetriever('')).toThrow(/userId/);
  });
});
