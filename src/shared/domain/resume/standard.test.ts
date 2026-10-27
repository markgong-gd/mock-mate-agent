/**
 * @file 【测试】简历标准：技能越界、数字丢失、空泛开头、栏目顺序
 */
import { describe, expect, it } from 'vitest';
import type { ProfileBody } from '@/shared/schemas/profile';
import type { ResumeContent } from '@/shared/schemas/resume';
import { resumeStandard } from './standard';

const FACT = '11111111-1111-4111-8111-111111111111';

const profile: ProfileBody = {
  contact: { name: '测试', phone: '', email: '' },
  headline: '前端工程师',
  summary: '摘要',
  experiences: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      company: '示例',
      title: '工程师',
      start: '2022-01',
      end: null,
      summary: '',
      facts: [{ id: FACT, text: '把首屏从 4 秒降到 1 秒' }],
    },
  ],
  skills: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      name: 'React',
      tag: 'react',
      level: 'proficient',
      evidenceFactIds: [],
    },
  ],
};

const content = (sections: ResumeContent['sections']): ResumeContent => ({
  headline: '前端工程师',
  summary: '摘要',
  sections,
});

const bullet = (text: string, heading = '工作经历') =>
  content([{ heading, bullets: [{ text, factRefs: [FACT], status: 'verified' }] }]);

describe('resumeStandard', () => {
  it('事实里的数字被丢掉时给出 warning', () => {
    const result = resumeStandard(bullet('优化了首屏'), profile);
    expect(result.issues.some((issue) => issue.code === 'dropped_number')).toBe(true);
  });

  it('数字都保留时不报 dropped_number', () => {
    const result = resumeStandard(bullet('把首屏从 4 秒降到 1 秒'), profile);
    expect(result.issues.some((issue) => issue.code === 'dropped_number')).toBe(false);
  });

  it('技能栏目出现档案外标签时给出 error', () => {
    const result = resumeStandard(bullet('使用 Vue 完成页面', '技能'), profile);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ level: 'error', code: 'skill_not_in_profile' }),
    );
  });

  it('熟练度写成精通但档案不是深入时给出 warning', () => {
    const result = resumeStandard(bullet('精通 React', '技能'), profile);
    expect(result.issues.some((issue) => issue.code === 'proficiency_upgrade')).toBe(true);
  });

  it('以「负责」开头且没有数字时给出 warning', () => {
    const result = resumeStandard(bullet('负责前端开发工作'), profile);
    expect(result.issues.some((issue) => issue.code === 'empty_phrase')).toBe(true);
  });

  it('技能排在经历之后、教育不在最后时给出 section_order', () => {
    const result = resumeStandard(
      content([
        { heading: '教育', bullets: [{ text: '本科', factRefs: [FACT], status: 'verified' }] },
        {
          heading: '工作经历',
          bullets: [{ text: '把首屏从 4 秒降到 1 秒', factRefs: [FACT], status: 'verified' }],
        },
        { heading: '技能', bullets: [{ text: '使用 React', factRefs: [FACT], status: 'verified' }] },
      ]),
      profile,
    );
    const order = result.issues.filter((issue) => issue.code === 'section_order');
    expect(order).toHaveLength(2);
  });

  it('同一栏目超过 5 条时给出 warning', () => {
    const result = resumeStandard(
      content([
        {
          heading: '工作经历',
          bullets: Array.from({ length: 6 }, () => ({
            text: '把首屏从 4 秒降到 1 秒',
            factRefs: [FACT],
            status: 'verified' as const,
          })),
        },
      ]),
      profile,
    );
    expect(result.issues.some((issue) => issue.code === 'too_many_bullets')).toBe(true);
  });
});
