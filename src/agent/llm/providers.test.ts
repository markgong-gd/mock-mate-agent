/**
 * @file 【测试】provider 工厂：dg-custom 以 OpenAI 兼容调用附带默认请求头
 */
import { describe, expect, it } from 'vitest';
import { createChatModel, dgCustomDefaultHeaders, jsonModeCallOptions } from './providers';

const options = { timeoutMs: 1000, maxRetries: 0, fakeDelayMs: 0, metadata: {} };

describe('dgCustomDefaultHeaders', () => {
  it('固定带 X-Product，可选头有值才写', () => {
    expect(dgCustomDefaultHeaders({})).toEqual({ 'X-Product': 'SaaS' });
    expect(
      dgCustomDefaultHeaders({
        enterpriseId: 'ent',
        userId: 'user-1',
        domain: 'example.com',
        ideType: 'ide',
        ideName: 'Cursor',
        ideVersion: '1.0.0',
      }),
    ).toEqual({
      'X-Product': 'SaaS',
      'X-Enterprise-Id': 'ent',
      'X-Tenant-Id': 'ent',
      'X-User-Id': 'user-1',
      'X-Domain': 'example.com',
      'X-IDE-Type': 'ide',
      'X-IDE-Name': 'Cursor',
      'X-IDE-Version': '1.0.0',
    });
  });
});

describe('createChatModel dg-custom', () => {
  it('把默认请求头交给 OpenAI 兼容客户端', () => {
    const model = createChatModel(
      {
        kind: 'dg-custom',
        baseUrl: 'https://copilot.tencent.com/v2',
        apiKey: 'ck_test',
        enterpriseId: 'ent',
      },
      'claude-opus-4.8-1m',
      options,
    );
    const params = model.identifyingParams() as { defaultHeaders?: Record<string, string>; baseURL?: string };
    expect(params.baseURL).toBe('https://copilot.tencent.com/v2');
    expect(params.defaultHeaders).toEqual({
      'X-Product': 'SaaS',
      'X-Enterprise-Id': 'ent',
      'X-Tenant-Id': 'ent',
    });
    expect(jsonModeCallOptions('dg-custom')).toEqual({ response_format: { type: 'json_object' } });
  });
});
