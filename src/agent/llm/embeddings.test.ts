/**
 * @file 【测试】离线哈希向量：字面重叠的文本更近；维度与决策一致
 */
import { describe, expect, it } from 'vitest';
import { EMBEDDING_DIM } from '@/shared/schemas/embedding';
import { useTestEnv } from '../../../tests/helpers/env';
import { getEmbeddings, hashEmbed, resetEmbeddingsForTesting } from './embeddings';

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

describe('hashEmbed', () => {
  it('维度为 1024，且共享用词的两段文本比无关文本更接近', () => {
    const react = hashEmbed('负责 React 性能优化，把首屏从 4 秒降到 1 秒');
    const related = hashEmbed('React 性能优化经验，首屏加载');
    const other = hashEmbed('组织周末羽毛球活动并负责订场地');
    expect(react).toHaveLength(EMBEDDING_DIM);
    expect(cosine(react, related)).toBeGreaterThan(cosine(react, other));
  });
});

describe('getEmbeddings', () => {
  it('未配置 MODEL_EMBED 时使用 fake n-gram，维度必须与表结构一致', () => {
    useTestEnv({ MODEL_EMBED: undefined });
    resetEmbeddingsForTesting();
    const model = getEmbeddings();
    expect(model.id).toBe('fake:ngram-1024');
    expect(model.dim).toBe(1024);
  });

  it('EMBEDDING_DIM 与列定义不一致时，环境变量解析直接失败', () => {
    expect(() => useTestEnv({ EMBEDDING_DIM: '768' })).toThrow(/1024/);
  });
});
