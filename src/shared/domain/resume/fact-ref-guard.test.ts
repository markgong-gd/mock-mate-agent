/**
 * @file 【测试】factRefGuard：有效引用、编造 id、空引用、模型自标 verified
 */
import { describe, expect, it } from 'vitest';
import type { ResumeContent } from '@/shared/schemas/resume';
import { factRefGuard, hasUnverified } from './fact-ref-guard';

const FACT = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const MADE_UP = '33333333-3333-4333-8333-333333333333';

const draft = (factRefs: string[], status: 'verified' | 'unverified' = 'verified'): ResumeContent => ({
  headline: '前端工程师',
  summary: '摘要',
  sections: [{ heading: '经历', bullets: [{ text: '把首屏从 4s 降到 1s', factRefs, status }] }],
});

describe('factRefGuard', () => {
  it('引用都在允许集合内时标 verified', () => {
    const result = factRefGuard(draft([FACT, OTHER]), [FACT, OTHER]);
    expect(result.unverifiedCount).toBe(0);
    expect(result.content.sections[0]?.bullets[0]?.status).toBe('verified');
    expect(hasUnverified(result.content)).toBe(false);
  });

  it('编造的 id 标 unverified，即使模型自己写了 verified', () => {
    const result = factRefGuard(draft([FACT, MADE_UP], 'verified'), [FACT]);
    expect(result.unverifiedCount).toBe(1);
    expect(result.content.sections[0]?.bullets[0]?.status).toBe('unverified');
    expect(hasUnverified(result.content)).toBe(true);
  });

  it('空引用标 unverified（Zod 正常会先拦住，这里是第二道）', () => {
    const result = factRefGuard(draft([]), [FACT]);
    expect(result.content.sections[0]?.bullets[0]?.status).toBe('unverified');
  });
});
