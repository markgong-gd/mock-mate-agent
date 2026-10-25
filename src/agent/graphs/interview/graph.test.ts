/**
 * @file 【测试】面试图：追问、下一题、结束、评估失败后续跑、用户中止
 * 假模型看到短回答会要求追问；MemorySaver 模拟存档。
 */
import { Command, MemorySaver } from '@langchain/langgraph';
import type { BaseMessage } from '@langchain/core/messages';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildInterviewGraph, type InterviewGraphDeps } from '@/agent/graphs/interview/graph';
import type { InterviewStateType } from '@/agent/graphs/interview/state';
import type { InterviewSettings } from '@/shared/schemas/interview';
import type { QueuedQuestion } from '@/shared/schemas/question';
import { useTestEnv } from '../../../../tests/helpers/env';

const settings: InterviewSettings = {
  questionCount: 2,
  difficultyMin: 1,
  difficultyMax: 5,
  style: 'standard',
  maxFollowUps: 1,
};

const q1: QueuedQuestion = {
  id: 'fe-react-001',
  content: 'React 渲染列表时，key 为什么要稳定，不能用数组下标凑合？',
  answerPoints: ['key 对应同一个组件实例', '下标变化会串状态'],
  skillTags: ['react'],
  difficulty: 2,
  type: 'concept',
  weaknessMatch: false,
};

const q2: QueuedQuestion = {
  id: 'fe-performance-001',
  content: '用户反馈首屏突然变慢时，你会先看哪些信号？',
  answerPoints: ['先看 LCP', '区分接口和渲染'],
  skillTags: ['performance'],
  difficulty: 4,
  type: 'scenario',
  weaknessMatch: false,
};

const LONG = '我把列表 key 换成了稳定的业务 id，插入和排序之后行状态不会串到别的行上。';

function textOf(message: BaseMessage): string {
  return typeof message.content === 'string' ? message.content : '';
}

function deps(
  extra: Partial<InterviewGraphDeps> = {},
): InterviewGraphDeps & { finished: { value: boolean } } {
  const finished = { value: false };
  return {
    finished,
    plan: async () => ({ questionQueue: [q1, q2], roleTitle: '前端工程师' }),
    recordAssistant: async () => undefined,
    markFinished: async () => {
      finished.value = true;
    },
    ...extra,
  };
}

async function drain(
  graph: ReturnType<typeof buildInterviewGraph>,
  input: Parameters<ReturnType<typeof buildInterviewGraph>['stream']>[0],
  threadId: string,
) {
  const stream = await graph.stream(input, {
    configurable: { thread_id: threadId, userId: 'user-1', requestId: 'req-1' },
    streamMode: 'updates',
  });
  for await (const _chunk of stream) {
    /* 消费到 interrupt 或结束 */
  }
}

describe('interview graph', () => {
  beforeEach(() => {
    useTestEnv({ FAKE_LLM_DELAY_MS: '0' });
  });

  it('浅回答追问一次，达到上限后下一题，再答完就结束', async () => {
    const graphDeps = deps();
    const graph = buildInterviewGraph(new MemorySaver(), graphDeps);
    const threadId = 'interview-happy';
    await drain(graph, { jobId: 'job-1', settings, maxFollowUps: 1 }, threadId);

    let snap = await graph.getState({
      configurable: { thread_id: threadId, userId: 'user-1', requestId: 'req-1' },
    });
    expect(snap.next).toContain('wait_answer');
    const first = textOf((snap.values as InterviewStateType).messages.at(-1)!);
    expect(first).toContain('key');

    await drain(graph, new Command({ resume: { turnId: 't1', text: '不知道' } }), threadId);
    snap = await graph.getState({
      configurable: { thread_id: threadId, userId: 'user-1', requestId: 'req-1' },
    });
    expect(textOf((snap.values as InterviewStateType).messages.at(-1)!)).toContain('具体一点');
    expect((snap.values as InterviewStateType).followUpCount).toBe(1);
    expect((snap.values as InterviewStateType).cursor).toBe(0);

    await drain(graph, new Command({ resume: { turnId: 't2', text: '还是不知道' } }), threadId);
    snap = await graph.getState({
      configurable: { thread_id: threadId, userId: 'user-1', requestId: 'req-1' },
    });
    expect(textOf((snap.values as InterviewStateType).messages.at(-1)!)).toContain('首屏');
    expect((snap.values as InterviewStateType).cursor).toBe(1);

    await drain(graph, new Command({ resume: { turnId: 't3', text: LONG } }), threadId);
    snap = await graph.getState({
      configurable: { thread_id: threadId, userId: 'user-1', requestId: 'req-1' },
    });
    expect((snap.values as InterviewStateType).status).toBe('finished');
    expect(snap.next).toEqual([]);
    expect(graphDeps.finished.value).toBe(true);
  });

  it('评估中途失败后，用同一个存档从 evaluate 续跑，回答还在', async () => {
    let fails = 1;
    const graphDeps = deps({
      beforeEvaluate: () => {
        if (fails > 0) {
          fails -= 1;
          throw new Error('evaluate failed');
        }
      },
    });
    const saver = new MemorySaver();
    const threadId = 'interview-retry';
    const cfg = { configurable: { thread_id: threadId, userId: 'user-1', requestId: 'req-1' } };
    const graph = buildInterviewGraph(saver, graphDeps);
    await drain(graph, { jobId: 'job-1', settings, maxFollowUps: 1 }, threadId);
    await expect(
      drain(graph, new Command({ resume: { turnId: 't1', text: LONG } }), threadId),
    ).rejects.toThrow(/evaluate failed/);

    const mid = await graph.getState(cfg);
    expect(mid.next).toContain('evaluate');
    expect((mid.values as InterviewStateType).messages.map(textOf).join('\n')).toContain(LONG);

    const resumed = buildInterviewGraph(saver, graphDeps);
    await drain(resumed, null, threadId);
    const after = await resumed.getState(cfg);
    expect(after.next).toContain('wait_answer');
    expect((after.values as InterviewStateType).cursor).toBe(1);
    expect((after.values as InterviewStateType).messages.map(textOf).join('\n')).toContain(LONG);
  });

  it('等待回答时中止，不再调用评估模型，并标记结束', async () => {
    let evaluated = 0;
    const graphDeps = deps({
      beforeEvaluate: () => {
        evaluated += 1;
      },
    });
    const graph = buildInterviewGraph(new MemorySaver(), graphDeps);
    const threadId = 'interview-abort';
    const cfg = { configurable: { thread_id: threadId, userId: 'user-1', requestId: 'req-1' } };
    await drain(graph, { jobId: 'job-1', settings, maxFollowUps: 1 }, threadId);
    await drain(graph, new Command({ resume: { turnId: 'stop', text: '', abort: true } }), threadId);
    const snap = await graph.getState(cfg);
    expect((snap.values as InterviewStateType).status).toBe('finished');
    expect(graphDeps.finished.value).toBe(true);
    expect(evaluated).toBe(0);
  });
});
