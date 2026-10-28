/**
 * @file 【测试】策划图：追问、按原话改稿、拒绝编造、失败后续跑
 */
import type { BaseMessage } from '@langchain/core/messages';
import { Command, MemorySaver } from '@langchain/langgraph';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildStudioGraph, proposeWithModel, type StudioGraphDeps } from '@/agent/graphs/studio/graph';
import type { StudioStateType } from '@/agent/graphs/studio/state';
import { STUDIO_LINES } from '@/shared/domain/studio/phase';
import { emptyStudioDocument, type StudioCoachProposal, type StudioDocument } from '@/shared/schemas/studio';
import { useTestEnv } from '../../../../tests/helpers/env';

const cfgFor = (threadId: string) => ({
  configurable: { thread_id: threadId, userId: 'user-1', requestId: 'req-1' },
});

function textOf(message: BaseMessage): string {
  return typeof message.content === 'string' ? message.content : '';
}

function proposal(patch: Partial<StudioCoachProposal> = {}): StudioCoachProposal {
  return {
    say: '先说说目标岗位。',
    action: 'ask',
    targetRole: '',
    focus: 'basics',
    document: emptyStudioDocument(),
    ...patch,
  };
}

function grounded(): StudioDocument {
  return {
    ...emptyStudioDocument(),
    basics: { ...emptyStudioDocument().basics, headline: '前端' },
    experiences: [
      { org: '字节跳动', title: '前端', start: '', end: '', bullets: ['首屏从 4 秒降到 1.8 秒'] },
    ],
  };
}

function deps(extra: Partial<StudioGraphDeps> = {}): StudioGraphDeps & {
  saved: StudioDocument[];
} {
  const saved: StudioDocument[] = [];
  return {
    saved,
    propose: async () => proposal(),
    recordAssistant: async () => undefined,
    saveSession: async (input) => {
      saved.push(input.document);
    },
    ...extra,
  };
}

async function drain(
  graph: ReturnType<typeof buildStudioGraph>,
  input: Parameters<ReturnType<typeof buildStudioGraph>['stream']>[0],
  threadId: string,
) {
  const stream = await graph.stream(input, { ...cfgFor(threadId), streamMode: 'updates' });
  for await (const _chunk of stream) {
    /* 消费到 interrupt 或结束 */
  }
}

describe('studio graph', () => {
  beforeEach(() => {
    useTestEnv({ FAKE_LLM_DELAY_MS: '0' });
  });

  it('开场先问岗位，并停下来等回复', async () => {
    const graph = buildStudioGraph(new MemorySaver(), {
      ...deps(),
      propose: proposeWithModel,
    });
    const threadId = 'studio-open';
    await drain(graph, {}, threadId);
    const snap = await graph.getState(cfgFor(threadId));
    expect(snap.next).toContain('wait_user');
    expect(textOf((snap.values as StudioStateType).messages.at(-1)!)).toContain('岗位');
    expect((snap.values as StudioStateType).document.experiences).toEqual([]);
  });

  it('原话里的经历会写进简历', async () => {
    const graphDeps = deps({
      propose: async (input) => {
        if (!input.userText) return proposal({ say: '你想应聘什么岗位？' });
        return proposal({
          say: '我按你说的加了一段字节跳动的经历。',
          action: 'revise',
          targetRole: '前端',
          focus: 'experience',
          document: grounded(),
        });
      },
    });
    const graph = buildStudioGraph(new MemorySaver(), graphDeps);
    const threadId = 'studio-revise';
    await drain(graph, {}, threadId);
    await drain(
      graph,
      new Command({ resume: { turnId: 't1', text: '我在字节跳动做前端，首屏从 4 秒降到 1.8 秒' } }),
      threadId,
    );
    const snap = await graph.getState(cfgFor(threadId));
    const state = snap.values as StudioStateType;
    expect(state.document.experiences[0]?.org).toBe('字节跳动');
    expect(state.targetRole).toBe('前端');
    expect(textOf(state.messages.at(-1)!)).toContain('字节跳动');
    expect(graphDeps.saved.at(-1)?.experiences[0]?.org).toBe('字节跳动');
  });

  it('编造的公司和数字不会进预览', async () => {
    const graphDeps = deps({
      propose: async (input) => {
        if (!input.userText) return proposal();
        return proposal({
          action: 'revise',
          targetRole: '前端',
          document: {
            ...emptyStudioDocument(),
            experiences: [
              { org: '阿里巴巴', title: '架构师', start: '', end: '', bullets: ['QPS 提升 10 倍'] },
            ],
          },
        });
      },
    });
    const graph = buildStudioGraph(new MemorySaver(), graphDeps);
    const threadId = 'studio-fake';
    await drain(graph, {}, threadId);
    await drain(
      graph,
      new Command({ resume: { turnId: 't1', text: '我在字节跳动做前端，首屏从 4 秒降到 1.8 秒' } }),
      threadId,
    );
    const state = (await graph.getState(cfgFor(threadId))).values as StudioStateType;
    expect(state.document.experiences).toEqual([]);
    expect(state.status).toBe('active');
    expect(textOf(state.messages.at(-1)!)).toBe(STUDIO_LINES.askDropped);
  });

  it('改稿失败后续跑，用户原话还在', async () => {
    let fails = 1;
    const graphDeps = deps({
      propose: async (input) => {
        if (input.userText && fails > 0) {
          fails -= 1;
          throw new Error('coach failed');
        }
        return proposal({ say: '你想应聘什么岗位？级别大概是初级、中级还是高级？' });
      },
    });
    const saver = new MemorySaver();
    const threadId = 'studio-retry';
    const graph = buildStudioGraph(saver, graphDeps);
    await drain(graph, {}, threadId);
    await expect(
      drain(graph, new Command({ resume: { turnId: 't1', text: '高级前端工程师' } }), threadId),
    ).rejects.toThrow(/coach failed/);

    const mid = await graph.getState(cfgFor(threadId));
    expect(mid.next).toContain('coach');
    expect((mid.values as StudioStateType).materials).toContain('高级前端工程师');

    const resumed = buildStudioGraph(saver, graphDeps);
    await drain(resumed, null, threadId);
    const after = (await resumed.getState(cfgFor(threadId))).values as StudioStateType;
    expect(after.materials).toContain('高级前端工程师');
    expect((await resumed.getState(cfgFor(threadId))).next).toContain('wait_user');
  });

  it('对不上的经历会说明怎样的一句才符合，按例子写就能进简历', async () => {
    const graph = buildStudioGraph(new MemorySaver(), { ...deps(), propose: proposeWithModel });
    const threadId = 'studio-gap';
    await drain(graph, {}, threadId);
    await drain(graph, new Command({ resume: { turnId: 't1', text: '中高级前端' } }), threadId);
    await drain(
      graph,
      new Command({
        resume: { turnId: 't2', text: '公司：mock1\n职位：前端开发工程师\n做的事：负责列表页' },
      }),
      threadId,
    );
    const rejected = (await graph.getState(cfgFor(threadId))).values as StudioStateType;
    expect(rejected.document.experiences).toEqual([]);
    expect(textOf(rejected.messages.at(-1)!)).toBe(STUDIO_LINES.askMaterialsRetry);

    await drain(
      graph,
      new Command({ resume: { turnId: 't3', text: '我在某公司做前端，把首屏从 4 秒降到 1.8 秒' } }),
      threadId,
    );
    const accepted = (await graph.getState(cfgFor(threadId))).values as StudioStateType;
    expect(accepted.document.experiences[0]?.org).toBe('某公司');
    expect(textOf(accepted.messages.at(-1)!)).not.toBe(STUDIO_LINES.askMaterialsRetry);
  });

  it('留下观察、模型、思考和规则步骤，刷新后还在', async () => {
    const graph = buildStudioGraph(new MemorySaver(), { ...deps(), propose: proposeWithModel });
    const threadId = 'studio-trace';
    const events: unknown[] = [];
    const stream = await graph.stream({}, { ...cfgFor(threadId), streamMode: ['custom', 'updates'] });
    for await (const chunk of stream) events.push(chunk);
    const custom = events.flatMap((chunk) => {
      if (Array.isArray(chunk) && chunk[0] === 'custom') return [chunk[1]];
      if (chunk && typeof chunk === 'object' && 'type' in chunk) return [chunk];
      return [];
    });
    const steps = custom.flatMap((event) => {
      if (!event || typeof event !== 'object' || !('step' in event)) return [];
      const step = event.step;
      if (!step || typeof step !== 'object' || !('kind' in step)) return [];
      return [
        step as {
          kind: string;
          status: string;
          title: string;
          input?: string;
          output?: string;
          model?: string;
        },
      ];
    });
    expect(steps.some((step) => step.kind === 'model' && step.status === 'running')).toBe(true);
    const coach = steps.find(
      (step) => step.kind === 'model' && step.status === 'ok' && step.title.includes('studio.coach'),
    );
    expect(coach?.input).toContain('TASK: studio.coach');
    expect(coach?.output).toContain('say');
    expect(coach?.model).toBeTruthy();

    const state = (await graph.getState(cfgFor(threadId))).values as StudioStateType;
    expect(state.traces.map((step) => step.kind)).toEqual([
      'observe',
      'model',
      'think',
      'tool',
      'tool',
      'model',
    ]);
    expect(state.traces.every((step) => step.status === 'ok')).toBe(true);
    const speak = state.traces.find((step) => step.functionId === 'studio.speak');
    expect(speak?.input).toContain('TASK: studio.speak');
    expect(speak?.output?.length).toBeGreaterThan(0);
  });
});
