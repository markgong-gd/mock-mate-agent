/**
 * @file 【测试】PII 脱敏规则与日志兜底（P3-07 / N-3）
 * 日志那半边用 loggerOptions + 自定义 destination 跑真实 pino，确认写出去的行里真的没有明文 PII。
 */
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { hasPii, redactPii, redactPiiDeep } from '@/shared/common/pii';
import { loggerOptions } from '@/shared/common/logger';

const PHONE = '13800138000';
const EMAIL = 'zhang.san@example.com';
const ID_CARD = '11010519491231002X';

describe('redactPii', () => {
  it('手机号、邮箱、证件号都换成占位符并记次数', () => {
    const result = redactPii(`联系我：${PHONE}，邮箱 ${EMAIL}，证件 ${ID_CARD}`);
    expect(result.text).not.toContain(PHONE);
    expect(result.text).not.toContain(EMAIL);
    expect(result.text).not.toContain(ID_CARD);
    expect(result.hits).toEqual({ phone: 1, email: 1, idCard: 1 });
  });

  it('18 位证件号不会被当成手机号截断', () => {
    expect(redactPii(ID_CARD).text).toBe('[ID]');
  });

  it('没有 PII 时原样返回', () => {
    expect(redactPii('我优化了列表渲染性能').hits).toEqual({ phone: 0, email: 0, idCard: 0 });
    expect(hasPii('我优化了列表渲染性能')).toBe(false);
  });
});

describe('redactPiiDeep', () => {
  it('递归处理数组与字面量对象', () => {
    const out = redactPiiDeep({ a: PHONE, b: { c: [EMAIL, '正常文本'] } });
    expect(JSON.stringify(out)).not.toContain(PHONE);
    expect(JSON.stringify(out)).not.toContain(EMAIL);
    expect(JSON.stringify(out)).toContain('正常文本');
  });

  it('Error 转成 pino 的 err 形状，message 与 stack 都脱敏', () => {
    const out = redactPiiDeep(new Error(`解析失败：${PHONE}`)) as {
      type: string;
      message: string;
      stack?: string;
    };
    expect(out.type).toBe('Error');
    expect(out.message).toContain('[PHONE]');
    expect(out.stack ?? '').not.toContain(PHONE);
  });

  it('Date 这类非字面量对象不会被拍平', () => {
    const date = new Date(0);
    expect(redactPiiDeep({ at: date })).toEqual({ at: date });
  });

  it('深度用完后原样返回，不会无限递归', () => {
    const deep = { a: { b: { c: { d: { e: PHONE } } } } };
    expect(redactPiiDeep(deep, 2)).toEqual({ a: { b: { c: { d: { e: PHONE } } } } });
  });
});

describe('logger 的 PII 兜底', () => {
  function capture(write: (log: pino.Logger) => void): string {
    const lines: string[] = [];
    const log = pino({ ...loggerOptions, level: 'info' }, { write: (line: string) => lines.push(line) });
    write(log);
    return lines.join('\n');
  }

  it('即使有人把原文塞进日志，写出去的行里也没有明文 PII', () => {
    const out = capture((log) => {
      log.info({ answer: `我的手机是 ${PHONE}`, nested: { email: EMAIL } }, `候选人留了 ${EMAIL}`);
    });
    expect(out).not.toContain(PHONE);
    expect(out).not.toContain(EMAIL);
    expect(out).toContain('[PHONE]');
    expect(out).toContain('[EMAIL]');
  });

  it('err 的 message 也会被脱敏', () => {
    const out = capture((log) => {
      log.error({ err: new Error(`写库失败：${ID_CARD}`) }, 'save failed');
    });
    expect(out).not.toContain(ID_CARD);
    expect(out).toContain('[ID]');
  });

  it('密钥类字段仍然按字段名盖掉', () => {
    const out = capture((log) => log.info({ apiKey: 'sk-secret-value' }, 'config'));
    expect(out).not.toContain('sk-secret-value');
    expect(out).toContain('[REDACTED]');
  });
});
