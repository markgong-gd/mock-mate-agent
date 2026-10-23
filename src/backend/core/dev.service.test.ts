/**
 * @file 【测试】回声图：interrupt → resume → 结束；更换图实例（模拟进程重启）后可继续 resume
 */
import { MemorySaver } from '@langchain/langgraph';
import type { UIMessageChunk } from 'ai';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getEchoThread, setEchoGraphForTesting, streamEchoTurn } from '@/backend/core/dev.service';
import { buildEchoGraph } from '@/agent/graphs/echo/graph';
import { readAll, TEST_USER_ID, useTestEnv } from '../../../tests/helpers/env';

const ctx = { userId: TEST_USER_ID, requestId: 'req-test-0001' };

/** 存档用 MemorySaver；streamEchoTurn 内的 usage 回调写库失败只记日志，不影响图测试 */
let saver: MemorySaver;

beforeEach(() => {
  useTestEnv();
  saver = new MemorySaver();
  setEchoGraphForTesting(buildEchoGraph(saver));
});
afterAll(() => setEchoGraphForTesting(undefined));

const textOf = (chunks: UIMessageChunk[]) =>
  chunks
    .filter((c): c is Extract<UIMessageChunk, { type: 'text-delta' }> => c.type === 'text-delta')
    .map((c) => c.delta)
    .join('');

describe('echo graph', () => {
  it('ask → interrupt；resume 后 reply → 下一题；达到轮数后结束', async () => {
    const t = 'thread-a';
    const first = await readAll(await streamEchoTurn(ctx, { threadId: t, answer: '' }));
    expect(first.filter((c) => c.type === 'start')).toHaveLength(1);
    expect(first.at(-1)?.type).toBe('finish');
    expect(first.some((c) => c.type === 'data-metrics')).toBe(true);
    expect(textOf(first)).toContain('第 1 个问题');

    let view = await getEchoThread(ctx, t);
    expect(view.next).toEqual(['wait_answer']);
    expect(view.messages).toHaveLength(1);

    const second = await readAll(await streamEchoTurn(ctx, { threadId: t, answer: '我是前端' }));
    expect(textOf(second)).toContain('收到你的回答：「我是前端」');
    expect(textOf(second)).toContain('第 2 个问题');

    await readAll(await streamEchoTurn(ctx, { threadId: t, answer: 'a2' }));
    await readAll(await streamEchoTurn(ctx, { threadId: t, answer: 'a3' }));
    view = await getEchoThread(ctx, t);
    expect(view.status).toBe('finished');
    expect(view.next).toEqual([]);
    expect(view.round).toBe(3);

    await expect(streamEchoTurn(ctx, { threadId: t, answer: 'x' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('换一个图实例（同一存档，模拟进程重启）后可继续 resume', async () => {
    const t = 'thread-b';
    await readAll(await streamEchoTurn(ctx, { threadId: t, answer: '' }));
    setEchoGraphForTesting(buildEchoGraph(saver));
    const chunks = await readAll(await streamEchoTurn(ctx, { threadId: t, answer: '重启后的回答' }));
    expect(textOf(chunks)).toContain('重启后的回答');
    const view = await getEchoThread(ctx, t);
    expect(view.messages.map((m) => m.role)).toEqual(['assistant', 'user', 'assistant', 'assistant']);
  });
});
