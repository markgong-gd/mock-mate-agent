/**
 * @file 【测试】进模型的文本里不能留下手机号和邮箱
 */
import { describe, expect, it } from 'vitest';
import { prepareModelText } from './model-text';

describe('prepareModelText', () => {
  it('替换手机号和邮箱', () => {
    const { text, hits } = prepareModelText(
      '我的手机是 13812345678，邮箱 test@example.com，熟悉 React',
      1000,
    );
    expect(text).not.toContain('13812345678');
    expect(text).not.toContain('test@example.com');
    expect(text).toContain('熟悉 React');
    expect(hits.phone).toBe(1);
    expect(hits.email).toBe(1);
  });
});
