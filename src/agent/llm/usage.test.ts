/**
 * @file 【测试】用量回调：记录别名 / 模型 / token / 耗时 / functionId，且不含正文
 */
import { HumanMessage } from '@langchain/core/messages';
import { afterEach, describe, expect, it } from 'vitest';
import { setServerEnvForTesting } from '@/shared/env/server';
import { TEST_USER_ID, useTestEnv } from '../../../tests/helpers/env';
import { getChatModel } from './registry';
import { UsageCallbackHandler, type LlmCallRecord } from './usage';

afterEach(() => setServerEnvForTesting(undefined));

describe('UsageCallbackHandler', () => {
  it('记录别名 / 模型 / token / 耗时 / functionId，且不含正文', async () => {
    useTestEnv();
    const records: LlmCallRecord[] = [];
    const handler = new UsageCallbackHandler(
      { userId: TEST_USER_ID, requestId: 'req-1', sessionId: 's-1' },
      (r) => {
        records.push(r);
      },
    );
    handler.awaitHandlers = true;
    const secret = '我的手机号是13800000000';
    await getChatModel('chat').model.invoke([new HumanMessage(secret)], {
      callbacks: [handler],
      metadata: { functionId: 'test.fn', promptVersion: 'v9' },
    });

    expect(records).toHaveLength(1);
    const r = records[0]!;
    expect(r).toMatchObject({
      userId: TEST_USER_ID,
      sessionId: 's-1',
      requestId: 'req-1',
      functionId: 'test.fn',
      promptVersion: 'v9',
      alias: 'chat',
      provider: 'fake',
      model: 'fake:echo',
      status: 'ok',
    });
    expect(r.inputTokens).toBeGreaterThan(0);
    expect(r.outputTokens).toBeGreaterThan(0);
    expect(JSON.stringify(r)).not.toContain('13800000000');
  });
});
