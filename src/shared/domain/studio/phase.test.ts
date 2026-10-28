/**
 * @file 【测试】策划阶段：先问岗位，拒绝编造，确认后才能导出
 */
import { describe, expect, it } from 'vitest';
import { emptyStudioDocument, type StudioCoachProposal, type StudioDocument } from '@/shared/schemas/studio';
import { STUDIO_LINES, settleCoachTurn, studioPhase } from './phase';

const corpus = '我在字节跳动做前端，首屏从 4 秒降到 1.8 秒';

function proposal(patch: Partial<StudioCoachProposal> = {}): StudioCoachProposal {
  return {
    say: '我改好了一节。',
    action: 'revise',
    targetRole: '前端',
    focus: 'experience',
    document: emptyStudioDocument(),
    ...patch,
  };
}

function withExperience(): StudioDocument {
  return {
    ...emptyStudioDocument(),
    basics: { ...emptyStudioDocument().basics, headline: '前端' },
    experiences: [
      { org: '字节跳动', title: '前端', start: '', end: '', bullets: ['首屏从 4 秒降到 1.8 秒'] },
    ],
  };
}

describe('studioPhase', () => {
  it('没有岗位时先问岗位', () => {
    expect(studioPhase({ targetRole: '', document: emptyStudioDocument(), userText: '' })).toBe('need_role');
  });

  it('短句「可以了」才算确认', () => {
    expect(studioPhase({ targetRole: '前端', document: withExperience(), userText: '可以了' })).toBe(
      'confirm',
    );
    expect(
      studioPhase({
        targetRole: '前端',
        document: withExperience(),
        userText: '这段经历里我写了可以了三个字，但其实还想改项目范围和结果',
      }),
    ).toBe('revise');
  });
});

describe('settleCoachTurn', () => {
  it('没有岗位时不能改稿', () => {
    const settled = settleCoachTurn({
      phase: 'need_role',
      proposal: proposal({ targetRole: '', document: withExperience() }),
      corpus: '',
      previous: emptyStudioDocument(),
      userText: '',
      targetRole: '',
    });
    expect(settled.action).toBe('ask');
    expect(settled.document.experiences).toEqual([]);
    expect(settled.say).toBe(STUDIO_LINES.askRole);
  });

  it('对不上原话的改稿退回追问', () => {
    const settled = settleCoachTurn({
      phase: 'need_materials',
      proposal: proposal({
        targetRole: '前端',
        document: {
          ...emptyStudioDocument(),
          experiences: [
            { org: '阿里巴巴', title: '架构师', start: '', end: '', bullets: ['QPS 提升 10 倍'] },
          ],
        },
      }),
      corpus,
      previous: emptyStudioDocument(),
      userText: corpus,
      targetRole: '前端',
    });
    expect(settled.action).toBe('ask');
    expect(settled.status).toBe('active');
    expect(settled.document.experiences).toEqual([]);
    expect(settled.say).toBe(STUDIO_LINES.askDropped);
    expect(settled.dropped).toBeGreaterThan(0);
    expect(settled.reason).toContain('对不上');
  });

  it('原话能对上就改这一节', () => {
    const settled = settleCoachTurn({
      phase: 'need_materials',
      proposal: proposal({ document: withExperience() }),
      corpus,
      previous: emptyStudioDocument(),
      userText: corpus,
      targetRole: '',
    });
    expect(settled.action).toBe('revise');
    expect(settled.targetRole).toBe('前端');
    expect(settled.document.experiences[0]?.org).toBe('字节跳动');
  });

  it('用户发过经历但仍写不进去时，说明怎样的一句才符合', () => {
    const userText = '公司：mock1\n职位：前端开发工程师\n做的事：负责列表页';
    const settled = settleCoachTurn({
      phase: 'need_materials',
      proposal: proposal({
        action: 'ask',
        say: STUDIO_LINES.askMaterials,
        targetRole: '中高级前端开发',
      }),
      corpus: userText,
      previous: emptyStudioDocument(),
      userText,
      targetRole: '中高级前端开发',
    });
    expect(settled.action).toBe('ask');
    expect(settled.say).toBe(STUDIO_LINES.askMaterialsRetry);
    expect(settled.say).toContain('例如');
    expect(settled.document.experiences).toEqual([]);
    expect(settled.reason).toContain('怎样');
  });

  it('模型已经给了例子时，沿用模型的话', () => {
    const say = '还缺结果。例如：我在 mock1 做前端开发工程师，把列表页加载从 4 秒降到 1.8 秒。';
    const settled = settleCoachTurn({
      phase: 'need_materials',
      proposal: proposal({ action: 'ask', say, targetRole: '前端' }),
      corpus: '公司：mock1',
      previous: emptyStudioDocument(),
      userText: '公司：mock1',
      targetRole: '前端',
    });
    expect(settled.say).toBe(say);
  });

  it('这句没有岗位时，说明怎样才算岗位', () => {
    const settled = settleCoachTurn({
      phase: 'need_role',
      proposal: proposal({ action: 'ask', say: '好的', targetRole: '' }),
      corpus: '随便聊聊',
      previous: emptyStudioDocument(),
      userText: '随便聊聊',
      targetRole: '',
    });
    expect(settled.say).toBe(STUDIO_LINES.askRoleRetry);
    expect(settled.say).toContain('例如');
  });

  it('经历含糊又没给例子时，说明要补什么样的数字', () => {
    const settled = settleCoachTurn({
      phase: 'clarify',
      proposal: proposal({ action: 'ask', say: '再具体一点。', targetRole: '前端' }),
      corpus,
      previous: withExperience(),
      userText: '就是做了一些优化',
      targetRole: '前端',
    });
    expect(settled.say).toBe(STUDIO_LINES.askClarify);
    expect(settled.say).toContain('例如');
  });

  it('没说可以了就不能 ready', () => {
    const settled = settleCoachTurn({
      phase: 'revise',
      proposal: proposal({ action: 'ready', say: '可以导出了' }),
      corpus,
      previous: withExperience(),
      userText: '再看看摘要',
      targetRole: '前端',
    });
    expect(settled.action).toBe('ask');
    expect(settled.status).toBe('active');
  });

  it('确认后停在当前稿，并允许导出', () => {
    const settled = settleCoachTurn({
      phase: 'confirm',
      proposal: proposal({
        action: 'revise',
        document: {
          ...withExperience(),
          experiences: [{ org: '阿里巴巴', title: '架构师', start: '', end: '', bullets: ['假的'] }],
        },
      }),
      corpus: '可以了',
      previous: withExperience(),
      userText: '可以了',
      targetRole: '前端',
    });
    expect(settled.action).toBe('ready');
    expect(settled.status).toBe('ready');
    expect(settled.document.experiences[0]?.org).toBe('字节跳动');
  });
});
