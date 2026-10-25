/**
 * @file 【测试】题库检索器：向量路和关键词路用 RRF 合并，两路都空时走词面重合
 */
import { describe, expect, it } from 'vitest';
import type { RetrievedQuestion } from '@/shared/schemas/question';
import { QuestionRetriever } from './question-retriever';

function hit(id: string, score: number): RetrievedQuestion {
  return {
    id,
    content: id,
    answerPoints: ['要点'],
    skillTags: ['react'],
    difficulty: 2,
    type: 'concept',
    score,
  };
}

describe('QuestionRetriever', () => {
  it('两路都出现的题排在只出现一路的前面', async () => {
    const retriever = new QuestionRetriever({
      embedQuery: async () => [0.1],
      embedModel: 'test',
      keyword: true,
      searchVector: async () => [hit('only-vector', 0.9), hit('both', 0.2)],
      searchKeyword: async () => [hit('both', 0.4), hit('only-keyword', 0.3)],
    });
    const result = await retriever.retrieve({ skills: ['react'], text: '列表 key', k: 3 });
    expect(result[0]?.id).toBe('both');
    expect(result.map((item) => item.id)).toContain('only-vector');
  });

  it('两路都空时，用词面重合从标签候选里挑', async () => {
    const listed = [hit('fe-react-key', 0), hit('fe-react-other', 0)];
    listed[0] = { ...listed[0]!, content: 'React 列表 key 为什么不能用数组下标' };
    listed[1] = { ...listed[1]!, content: '说说 useEffect 的依赖数组' };
    const retriever = new QuestionRetriever({
      embedQuery: async () => [0.1],
      embedModel: 'test',
      keyword: true,
      searchVector: async () => [],
      searchKeyword: async () => [],
      listBySkills: async () => listed,
    });
    const result = await retriever.retrieve({ skills: ['react'], text: '列表 key 数组下标', k: 1 });
    expect(result[0]?.id).toBe('fe-react-key');
  });
});
