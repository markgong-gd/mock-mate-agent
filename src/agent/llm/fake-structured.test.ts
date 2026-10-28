/**
 * @file 【测试】离线草稿能通过对应的 Zod；编造引用会被 guard 标出
 */
import { describe, expect, it } from 'vitest';
import { factRefGuard } from '@/shared/domain/resume/fact-ref-guard';
import { answerScoreSchema, trainingPlanSchema } from '@/shared/schemas/diagnosis';
import { jobExtractOutputSchema } from '@/shared/schemas/job';
import { profileExtractOutputSchema } from '@/shared/schemas/profile';
import { resumeContentSchema } from '@/shared/schemas/resume';
import { studioCoachProposalSchema } from '@/shared/schemas/studio';
import { weaknessExtractOutputSchema } from '@/shared/schemas/weakness';
import { fakeStructuredReply } from './fake-structured';

const FACT = '11111111-1111-4111-8111-111111111111';

const scorePrompt = (answer: string) =>
  [
    'TASK: diagnosis.score',
    'DIMENSIONS:',
    'tech_depth\nstructure\njob_fit\ncommunication',
    'END_DIMENSIONS',
    'QUESTION:\nReact 的 key 为什么要稳定？\nEND_QUESTION',
    `ANSWER:\n${answer}\nEND_ANSWER`,
  ].join('\n');

const weaknessPrompt = [
  'TASK: diagnosis.weakness',
  'TAGS:',
  'react\nperformance',
  'END_TAGS',
  'TRANSCRIPT:',
  '[T1] 题：key 为什么要稳定？ ｜ 答：不知道',
  '[T2] 题：首屏变慢先看什么？ ｜ 答：我先看 LCP 和接口耗时，再决定加缓存还是拆包。',
  'END_TRANSCRIPT',
].join('\n');

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
    const raw = fakeStructuredReply(
      'TASK: job.extract\n<<<DATA\n高级前端\n要求熟悉 TypeScript 与 React\nDATA',
    );
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

  it('诊断打分只输出 DIMENSIONS 里的 key，具体回答分数更高', () => {
    const vague = answerScoreSchema.parse(JSON.parse(fakeStructuredReply(scorePrompt('不知道'))!));
    const deep = answerScoreSchema.parse(
      JSON.parse(
        fakeStructuredReply(
          scorePrompt('我把 key 换成稳定的业务 id，插入排序后行状态不会串，也补了回归用例。'),
        )!,
      ),
    );
    expect(vague.dimensions.map((d) => d.key)).toEqual([
      'tech_depth',
      'structure',
      'job_fit',
      'communication',
    ]);
    expect(deep.dimensions[0]!.score).toBeGreaterThan(vague.dimensions[0]!.score);
    expect(vague.gap.length).toBeGreaterThan(0);
  });

  it('短板草稿的 tag 取自 TAGS，证据引用 TRANSCRIPT 里的编号和原话', () => {
    const parsed = weaknessExtractOutputSchema.parse(JSON.parse(fakeStructuredReply(weaknessPrompt)!));
    expect(parsed.weaknesses.length).toBeGreaterThan(0);
    for (const item of parsed.weaknesses) {
      expect(['react', 'performance']).toContain(item.tag);
      expect(['T1', 'T2']).toContain(item.evidenceRef);
    }
    expect(parsed.weaknesses[0]!.evidenceQuote).toBe('不知道');
  });

  it('复训计划只覆盖 WEAKNESSES 里的技能；没有短板时为空', () => {
    const withItems = trainingPlanSchema.parse(
      JSON.parse(
        fakeStructuredReply('TASK: diagnosis.plan\nWEAKNESSES:\n- [react] 标题：说明\nEND_WEAKNESSES')!,
      ),
    );
    expect(withItems.items.map((item) => item.tag)).toEqual(['react']);
    const empty = trainingPlanSchema.parse(
      JSON.parse(fakeStructuredReply('TASK: diagnosis.plan\nWEAKNESSES:\n- （无）\nEND_WEAKNESSES')!),
    );
    expect(empty.items).toEqual([]);
  });

  it('策划师开场是追问，开口那句原样返回', () => {
    const proposal = studioCoachProposalSchema.parse(
      JSON.parse(
        fakeStructuredReply(
          [
            'TASK: studio.coach',
            'PHASE: need_role',
            'TARGET_ROLE: ',
            'USER:',
            '',
            'END_USER',
            'MATERIALS:',
            '',
            'END_MATERIALS',
            'DOCUMENT:',
            '{}',
            'END_DOCUMENT',
          ].join('\n'),
        )!,
      ),
    );
    expect(proposal.action).toBe('ask');
    expect(proposal.say).toContain('岗位');
    expect(fakeStructuredReply('TASK: studio.speak\nSAY:\n先问岗位。\nEND_SAY')).toBe('先问岗位。');
  });

  it('经历对不上时说明怎样的一句才符合', () => {
    const proposal = studioCoachProposalSchema.parse(
      JSON.parse(
        fakeStructuredReply(
          [
            'TASK: studio.coach',
            'PHASE: need_materials',
            'TARGET_ROLE: 中高级前端',
            'USER:',
            '公司：mock1',
            '职位：前端开发工程师',
            'END_USER',
            'MATERIALS:',
            '公司：mock1',
            'END_MATERIALS',
            'DOCUMENT:',
            '{}',
            'END_DOCUMENT',
          ].join('\n'),
        )!,
      ),
    );
    expect(proposal.action).toBe('ask');
    expect(proposal.say).toContain('例如');
    expect(proposal.say).toContain('公司');
    expect(proposal.document.experiences).toEqual([]);
  });

  it('普通对话不拦截', () => {
    expect(fakeStructuredReply('请做一个自我介绍')).toBeUndefined();
  });
});
