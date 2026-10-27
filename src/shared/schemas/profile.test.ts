/**
 * @file 【测试】档案：深入技能必须关联本档案中的事实
 */
import { describe, expect, it } from 'vitest';
import { profileBodySchema, profileExtractOutputSchema } from './profile';

const factId = '11111111-1111-4111-8111-111111111111';

const base = {
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
      facts: [{ id: factId, text: '做过 React' }],
    },
  ],
};

describe('profileBodySchema skill level', () => {
  it('抽取输出不要求熟练度和证据', () => {
    const parsed = profileExtractOutputSchema.parse({
      headline: '前端',
      summary: '摘要',
      experiences: [
        {
          company: '示例',
          title: '工程师',
          start: '2022-01',
          end: null,
          summary: '',
          facts: [{ text: '做过 React' }],
        },
      ],
      skills: [{ name: 'React', tag: 'react' }],
    });
    expect(parsed.skills[0]?.tag).toBe('react');
  });

  it('未写熟练度时默认为 used', () => {
    const parsed = profileBodySchema.parse({
      ...base,
      skills: [{ id: '44444444-4444-4444-8444-444444444444', name: 'React', tag: 'react' }],
    });
    expect(parsed.skills[0]?.level).toBe('used');
    expect(parsed.skills[0]?.evidenceFactIds).toEqual([]);
  });

  it('expert 没有证据时失败', () => {
    const parsed = profileBodySchema.safeParse({
      ...base,
      skills: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          name: 'React',
          tag: 'react',
          level: 'expert',
          evidenceFactIds: [],
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it('证据 id 不在本档案中时失败', () => {
    const parsed = profileBodySchema.safeParse({
      ...base,
      skills: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          name: 'React',
          tag: 'react',
          level: 'expert',
          evidenceFactIds: ['99999999-9999-4999-8999-999999999999'],
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it('expert 关联本档案事实时通过', () => {
    const parsed = profileBodySchema.safeParse({
      ...base,
      skills: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          name: 'React',
          tag: 'react',
          level: 'expert',
          evidenceFactIds: [factId],
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });
});
