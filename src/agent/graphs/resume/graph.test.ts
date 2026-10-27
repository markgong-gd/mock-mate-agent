/**
 * @file 【测试】简历图的 guard 分支：合法引用保持 verified，编造 id 标 unverified 后才保存
 */
import { describe, expect, it } from 'vitest';
import type { JobView } from '@/shared/schemas/job';
import type { ProfileBody } from '@/shared/schemas/profile';
import type { ResumeContent, ResumeQuality } from '@/shared/schemas/resume';
import { buildResumeGraph, type ResumeGraphDeps } from './graph';

const FACT = '11111111-1111-4111-8111-111111111111';
const MADE_UP = '33333333-3333-4333-8333-333333333333';

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
      facts: [{ id: FACT, text: '做过 React 性能优化' }],
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

const job: JobView = {
  id: '55555555-5555-4555-8555-555555555555',
  title: '前端',
  company: null,
  summary: '',
  rawText: 'React',
  createdAt: '2026-10-24T00:00:00.000Z',
  requirements: [
    {
      id: '66666666-6666-4666-8666-666666666666',
      label: 'React',
      tag: 'react',
      importance: 'must',
      description: '',
    },
  ],
};

function deps(draft: ResumeContent): { graphDeps: ResumeGraphDeps; saved: ResumeContent[] } {
  const saved: ResumeContent[] = [];
  const graphDeps: ResumeGraphDeps = {
    load: async () => ({ profile, job }),
    retrieve: async () => [
      { id: FACT, experienceId: profile.experiences[0]!.id, text: '做过 React 性能优化', score: 1 },
    ],
    generate: async () => draft,
    save: async (_userId, _jobId, content, _quality) => {
      saved.push(content);
      return { id: '77777777-7777-4777-8777-777777777777' };
    },
  };
  return { graphDeps, saved };
}

const bullet = (factRefs: string[]): ResumeContent => ({
  headline: '前端工程师',
  summary: '摘要',
  sections: [{ heading: '经历', bullets: [{ text: '优化了首屏', factRefs, status: 'verified' }] }],
});

const configurable = { thread_id: 'resume-test', userId: 'user-1', requestId: 'req-1' };

describe('resume graph guard', () => {
  it('引用真实事实时保存为 verified', async () => {
    const { graphDeps, saved } = deps(bullet([FACT]));
    const state = await buildResumeGraph(graphDeps).invoke({ jobId: job.id }, { configurable });
    expect(saved[0]?.sections[0]?.bullets[0]?.status).toBe('verified');
    expect(state.savedId).toBe('77777777-7777-4777-8777-777777777777');
  });

  it('编造的 factRef 会被标 unverified，并且这就是落库的内容', async () => {
    const { graphDeps, saved } = deps(bullet([MADE_UP]));
    await buildResumeGraph(graphDeps).invoke({ jobId: job.id }, { configurable });
    expect(saved[0]?.sections[0]?.bullets[0]?.status).toBe('unverified');
    expect(saved[0]?.sections[0]?.bullets[0]?.factRefs).toEqual([MADE_UP]);
  });

  it('主简历没有岗位，标准检查会记下丢失的数字', async () => {
    const numbered: ProfileBody = {
      ...profile,
      experiences: [
        {
          ...profile.experiences[0]!,
          facts: [{ id: FACT, text: '把首屏从 4 秒降到 1 秒' }],
        },
      ],
    };
    const qualities: ResumeQuality[] = [];
    const graphDeps: ResumeGraphDeps = {
      load: async () => ({ profile: numbered, job: null }),
      retrieve: async () => [
        { id: FACT, experienceId: numbered.experiences[0]!.id, text: '把首屏从 4 秒降到 1 秒', score: 0 },
      ],
      generate: async () => bullet([FACT]),
      save: async (_userId, jobId, _content, quality) => {
        expect(jobId).toBeNull();
        qualities.push(quality);
        return { id: '77777777-7777-4777-8777-777777777777' };
      },
    };
    await buildResumeGraph(graphDeps).invoke({ jobId: null }, { configurable });
    expect(qualities[0]?.issues.some((issue) => issue.code === 'dropped_number')).toBe(true);
  });
});
