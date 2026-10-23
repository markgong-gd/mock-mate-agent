/**
 * @file 【测试】模型注册表：改环境变量即可切换 provider、白名单校验、能力表覆盖
 */
import { ChatDeepSeek } from '@langchain/deepseek';
import { ChatOpenAI } from '@langchain/openai';
import { afterEach, describe, expect, it } from 'vitest';
import { setServerEnvForTesting } from '@/shared/env/server';
import { useTestEnv } from '../../../tests/helpers/env';
import { pickStructuredMethod, resolveCaps } from './caps';
import { FakeEchoChatModel } from './fake';
import { assertRegistry, getChatModel } from './registry';

afterEach(() => setServerEnvForTesting(undefined));

const PROVIDERS = {
  PROVIDERS: 'fake,deepseek,glm',
  PROVIDER_DEEPSEEK_KIND: 'deepseek',
  PROVIDER_DEEPSEEK_API_KEY: 'sk-test',
  PROVIDER_GLM_KIND: 'openai-compatible',
  PROVIDER_GLM_BASE_URL: 'https://open.bigmodel.cn/api/paas/v4',
  PROVIDER_GLM_API_KEY: 'glm-test',
};

describe('model registry', () => {
  it('只改环境变量即可切换别名对应的 provider 与模型', () => {
    useTestEnv(PROVIDERS);
    expect(getChatModel('chat').model).toBeInstanceOf(FakeEchoChatModel);

    useTestEnv({ ...PROVIDERS, MODEL_CHAT: 'deepseek:deepseek-chat' });
    const ds = getChatModel('chat');
    expect(ds.model).toBeInstanceOf(ChatDeepSeek);
    expect(ds.id).toBe('deepseek:deepseek-chat');
    expect(ds.caps.tools).toBe(true);

    useTestEnv({ ...PROVIDERS, MODEL_CHAT: 'glm:glm-4-flash' });
    const glm = getChatModel('chat');
    expect(glm.model).toBeInstanceOf(ChatOpenAI);
    expect((glm.model as ChatOpenAI).model).toBe('glm-4-flash');
    expect(glm.jsonModeOptions).toEqual({ response_format: { type: 'json_object' } });
  });

  it('provider 不在 ALLOWED_PROVIDERS 白名单时启动校验失败', () => {
    useTestEnv({ ...PROVIDERS, MODEL_CHAT: 'deepseek:deepseek-chat', ALLOWED_PROVIDERS: 'fake,glm' });
    expect(() => assertRegistry()).toThrow(/ALLOWED_PROVIDERS/);
  });

  it('未配置的别名报错', () => {
    useTestEnv();
    expect(() => getChatModel('fallback')).toThrow(/MODEL_FALLBACK/);
  });
});

describe('caps', () => {
  it('内置能力表 + MODEL_CAPS 覆盖，并据此选择结构化方式', () => {
    expect(pickStructuredMethod(resolveCaps('deepseek', 'deepseek-chat'))).toBe('functionCalling');
    expect(pickStructuredMethod(resolveCaps('openai-compatible', 'gpt-4o-mini'))).toBe('jsonSchema');
    expect(pickStructuredMethod(resolveCaps('openai-compatible', 'some-unknown-model'))).toBe('prompt');
    expect(pickStructuredMethod(resolveCaps('openai-compatible', 'glm-4-flash', { tools: false }))).toBe(
      'jsonMode',
    );
    expect(resolveCaps('openai-compatible', 'deepseek-reasoner').reasoning).toBe(true);
  });
});
