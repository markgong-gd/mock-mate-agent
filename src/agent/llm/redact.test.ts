/**
 * @file 【测试】脱敏：手机号、邮箱、证件号，以及它们同时出现
 */
import { describe, expect, it } from 'vitest';
import { redactPii } from './redact';

describe('redactPii', () => {
  it('去掉手机号、邮箱和证件号，正文其余部分还在', () => {
    const { text, hits } = redactPii(
      '张三 13812345678 zhangsan@example.com 证件 11010119900307888X 熟悉 React',
    );
    expect(text).not.toContain('13812345678');
    expect(text).not.toContain('zhangsan@example.com');
    expect(text).not.toContain('11010119900307888X');
    expect(text).toContain('熟悉 React');
    expect(text).toContain('[PHONE]');
    expect(text).toContain('[EMAIL]');
    expect(text).toContain('[ID]');
    expect(hits).toEqual({ phone: 1, email: 1, idCard: 1 });
  });

  it('带空格的手机号也会被替换', () => {
    expect(redactPii('联系 138 1234 5678').text).not.toContain('138');
  });

  it('没有 PII 时原样返回', () => {
    const { text, hits } = redactPii('负责 React 性能优化');
    expect(text).toBe('负责 React 性能优化');
    expect(hits).toEqual({ phone: 0, email: 0, idCard: 0 });
  });
});
