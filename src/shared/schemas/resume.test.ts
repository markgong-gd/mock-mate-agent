/**
 * @file 【测试】简历 schema：没有 factRefs 的 bullet 不能通过
 */
import { describe, expect, it } from 'vitest';
import { questionSeedSchema } from './question';
import { resumeContentSchema } from './resume';

describe('resumeContentSchema', () => {
  it('缺少 factRefs 的 bullet 校验失败', () => {
    const parsed = resumeContentSchema.safeParse({
      headline: '前端工程师',
      summary: '摘要',
      sections: [{ heading: '经历', bullets: [{ text: '负责性能优化' }] }],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.path.includes('factRefs'))).toBe(true);
    }
  });

  it('factRefs 为空数组时校验失败', () => {
    const parsed = resumeContentSchema.safeParse({
      headline: '前端工程师',
      summary: '摘要',
      sections: [{ heading: '经历', bullets: [{ text: '负责性能优化', factRefs: [] }] }],
    });
    expect(parsed.success).toBe(false);
  });

  it('有引用时通过，并默认 status 为 verified', () => {
    const parsed = resumeContentSchema.parse({
      headline: '前端工程师',
      summary: '摘要',
      sections: [
        {
          heading: '经历',
          bullets: [{ text: '负责性能优化', factRefs: ['11111111-1111-4111-8111-111111111111'] }],
        },
      ],
    });
    expect(parsed.sections[0]?.bullets[0]?.status).toBe('verified');
  });
});

describe('questionSeedSchema', () => {
  it('接受一条符合题库规范的题目', () => {
    const parsed = questionSeedSchema.parse({
      id: 'fe-react-001',
      content: 'React 中 key 的作用是什么？',
      answerPoints: ['帮助协调列表节点的复用'],
      skillTags: ['react'],
      difficulty: 2,
      type: 'concept',
      source: 'original',
      license: 'internal-original',
    });
    expect(parsed.skillTags).toEqual(['react']);
  });

  it('拒绝目录之外的技能标签', () => {
    const parsed = questionSeedSchema.safeParse({
      id: 'fe-react-002',
      content: '题干',
      answerPoints: ['要点'],
      skillTags: ['cobol'],
      difficulty: 1,
      type: 'concept',
      source: 'original',
      license: 'internal-original',
    });
    expect(parsed.success).toBe(false);
  });
});
