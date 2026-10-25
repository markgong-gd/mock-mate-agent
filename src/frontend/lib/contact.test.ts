/**
 * @file 【测试】浏览器端联系方式抽取：原文里的号码不会留在待发送文本中
 */
import { describe, expect, it } from 'vitest';
import { extractContact } from './contact';

describe('extractContact', () => {
  it('抽出手机号和邮箱，并从文本中移除', () => {
    const result = extractContact('张三 13812345678 a@example.com 熟悉 React');
    expect(result.phone).toBe('13812345678');
    expect(result.email).toBe('a@example.com');
    expect(result.text).not.toContain('13812345678');
    expect(result.text).not.toContain('a@example.com');
    expect(result.text).toContain('熟悉 React');
  });
});
