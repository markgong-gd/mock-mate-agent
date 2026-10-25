/**
 * @file 【测试】模型单价与成本估算
 */
import { describe, expect, it } from 'vitest';
import { estimateCost, priceOf, sumCost } from '@/agent/llm/pricing';

describe('priceOf', () => {
  it('精确匹配优先于 provider 兜底', () => {
    expect(priceOf('deepseek', 'deepseek-chat')).toEqual({ input: 2, output: 8 });
    expect(priceOf('ollama', 'bge-m3')).toEqual({ input: 0, output: 0 });
  });

  it('没配单价时返回 undefined', () => {
    expect(priceOf('somecloud', 'some-model')).toBeUndefined();
  });
});

describe('estimateCost', () => {
  it('按百万 token 折算', () => {
    const cost = estimateCost({
      provider: 'deepseek',
      model: 'deepseek-chat',
      inputTokens: 500_000,
      outputTokens: 250_000,
    });
    // 0.5 * 2 + 0.25 * 8 = 3
    expect(cost).toBe(3);
  });

  it('token 缺失按 0 计，免费模型是 0 而不是 null', () => {
    expect(estimateCost({ provider: 'fake', model: 'echo', inputTokens: null })).toBe(0);
  });

  it('单价未配置时返回 null，不要糊成 0', () => {
    expect(estimateCost({ provider: 'somecloud', model: 'x', inputTokens: 1000 })).toBeNull();
  });
});

describe('sumCost', () => {
  it('逐条相加', () => {
    const total = sumCost([
      { provider: 'deepseek', model: 'deepseek-chat', inputTokens: 1_000_000, outputTokens: 0 },
      { provider: 'deepseek', model: 'deepseek-chat', inputTokens: 0, outputTokens: 1_000_000 },
    ]);
    expect(total).toBe(10);
  });

  it('只要有一条没配单价，整笔返回 null', () => {
    const total = sumCost([
      { provider: 'deepseek', model: 'deepseek-chat', inputTokens: 1000 },
      { provider: 'somecloud', model: 'x', inputTokens: 1000 },
    ]);
    expect(total).toBeNull();
  });

  it('空列表是 0', () => {
    expect(sumCost([])).toBe(0);
  });
});
