/**
 * @file 【测试】graphToUIStream：节点异常时的错误编码与收尾、错误分类不泄露原文
 */
import { Annotation, MemorySaver, StateGraph } from '@langchain/langgraph';
import type { UIMessageChunk } from 'ai';
import { describe, expect, it } from 'vitest';
import { AppError } from '@/shared/common/errors';
import { readAll } from '../../../tests/helpers/env';
import { encodeStreamError, graphToUIStream } from './stream';

const failingGraph = (err: Error) =>
  new StateGraph(Annotation.Root({ x: Annotation<number> }))
    .addNode('boom', () => {
      throw err;
    })
    .addEdge('__start__', 'boom')
    .compile({ checkpointer: new MemorySaver() });

describe('graphToUIStream', () => {
  it('节点异常 → 流内 error 统一编码为 { code, message }，仍以 metrics + finish 收尾', async () => {
    const g = failingGraph(new AppError('LLM_TIMEOUT'));
    const stream = await g.stream(
      { x: 1 },
      { configurable: { thread_id: 't' }, streamMode: ['values', 'messages', 'custom'] },
    );
    const chunks = await readAll(graphToUIStream(stream));
    const err = chunks.find((c): c is Extract<UIMessageChunk, { type: 'error' }> => c.type === 'error');
    expect(err).toBeDefined();
    expect(JSON.parse(err!.errorText)).toEqual({ code: 'LLM_TIMEOUT', message: '模型响应超时，请稍后重试' });
    expect(chunks[0]?.type).toBe('start');
    expect(chunks.at(-1)?.type).toBe('finish');
  });

  it('错误分类：AppError 保留 code；provider 错误归为 LLM_UNAVAILABLE；未知错误为 INTERNAL 且不泄露原文', () => {
    expect(JSON.parse(encodeStreamError(new AppError('RATE_LIMITED'))).code).toBe('RATE_LIMITED');
    const providerErr = Object.assign(new Error('upstream 502'), { status: 502 });
    expect(JSON.parse(encodeStreamError(providerErr)).code).toBe('LLM_UNAVAILABLE');
    const internal = JSON.parse(encodeStreamError(new Error('select * from users where secret=1')));
    expect(internal.code).toBe('INTERNAL');
    expect(internal.message).not.toContain('secret');
  });
});
