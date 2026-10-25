/**
 * @file 【测试】离线草稿能通过对应的 Zod；编造引用会被 guard 标出
 */
import { describe, expect, it } from 'vitest';
import { factRefGuard } from '@/shared/domain/resume/fact-ref-guard';
import { jobExtractOutputSchema } from '@/shared/schemas/job';
import { profileExtractOutputSchema } from '@/shared/schemas/profile';
import { resumeContentSchema } from '@/shared/schemas/resume';
import { fakeStructuredReply } from './fake-structured';

const FACT = '11111111-1111-4111-8111-111111111111';

describe('fakeStructuredReply', () => {
  it('档案抽取草稿通过 Zod，且不回写手机号', () => {
    const raw = fakeStructuredReply(
      `TASK: profile.extract\n<<<DATA\n手机 [PHONE] 负责 React 性能优化，首屏从 4 秒降到 1 秒。\nDATA`,
    );
    expect(raw).toBeTruthy();
    const parsed = profileExtractOutputSchema.parse(JSON.parse(raw!));
    expect(parsed.skills.some((s) => s.tag === 'react')).toBe(true);
    expect(parsed.skills.some((s) => s.tag === 'performance')).toBe(true);
    expect(JSON.stringify(parsed)).not.toContain('138');
  });

  it('JD 抽取能认出目录内技能', () => {
    const raw = fakeStructuredReply('TASK: job.extract\n<<<DATA\n高级前端\n要求熟悉 TypeScript 与 React\nDATA');
    const parsed = jobExtractOutputSchema.parse(JSON.parse(raw!));
    expect(parsed.requirements.map((r) => r.tag)).toEqual(expect.arrayContaining(['typescript', 'react']));
  });

  it('简历草稿引用提示词里的事实 id；故意编造的引用会被 guard 拦住', () => {
    const raw = fakeStructuredReply(`TASK: resume.generate\n事实 ${FACT}\n__bad_fact_ref__`);
    const draft = resumeContentSchema.parse(JSON.parse(raw!));
    const guarded = factRefGuard(draft, [FACT]);
    const statuses = guarded.content.sections[0]?.bullets.map((b) => b.status);
    expect(statuses).toContain('verified');
    expect(statuses).toContain('unverified');
  });

  it('普通对话不拦截', () => {
    expect(fakeStructuredReply('请做一个自我介绍')).toBeUndefined();
  });
});
