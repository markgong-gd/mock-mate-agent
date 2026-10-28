/**
 * @file 【测试】环境变量解析：必填项、provider 字段、别名引用、口令配置、生产默认值
 */
import { describe, expect, it } from 'vitest';
import { EnvError, parseServerEnv } from './server';
import { baseTestEnv } from '../../../tests/helpers/env';

describe('parseServerEnv', () => {
  it('缺少必填变量时报错并列出全部问题', () => {
    expect(() => parseServerEnv({ NODE_ENV: 'test' })).toThrow(EnvError);
    try {
      parseServerEnv({ NODE_ENV: 'test' });
    } catch (e) {
      const msg = (e as EnvError).issues.join('\n');
      expect(msg).toContain('DATABASE_URL');
      expect(msg).toContain('MODEL_CHAT');
    }
  });

  it('按 PROVIDERS 解析 PROVIDER_<NAME>_*，并校验 kind 所需字段', () => {
    expect(() =>
      parseServerEnv(baseTestEnv({ PROVIDERS: 'fake,glm', PROVIDER_GLM_KIND: 'openai-compatible' })),
    ).toThrow(/PROVIDER_GLM_BASE_URL[\s\S]*PROVIDER_GLM_API_KEY/);

    const env = parseServerEnv(
      baseTestEnv({
        PROVIDERS: 'fake,glm',
        PROVIDER_GLM_KIND: 'openai-compatible',
        PROVIDER_GLM_BASE_URL: 'https://open.bigmodel.cn/api/paas/v4',
        PROVIDER_GLM_API_KEY: 'k',
        MODEL_EXTRACT: 'glm:glm-4-flash',
      }),
    );
    expect(env.llm.providers.glm?.kind).toBe('openai-compatible');
    expect(env.llm.models.extract).toEqual({ provider: 'glm', model: 'glm-4-flash', id: 'glm:glm-4-flash' });
  });

  it('dg-custom 需要地址和密钥，并收下可选网关头', () => {
    expect(() =>
      parseServerEnv(baseTestEnv({ PROVIDERS: 'fake,dg-custom', PROVIDER_DG_CUSTOM_KIND: 'dg-custom' })),
    ).toThrow(/PROVIDER_DG_CUSTOM_BASE_URL[\s\S]*PROVIDER_DG_CUSTOM_API_KEY/);

    const env = parseServerEnv(
      baseTestEnv({
        PROVIDERS: 'fake,dg-custom',
        PROVIDER_DG_CUSTOM_KIND: 'dg-custom',
        PROVIDER_DG_CUSTOM_BASE_URL: 'https://copilot.tencent.com/v2',
        PROVIDER_DG_CUSTOM_API_KEY: 'ck_test',
        PROVIDER_DG_CUSTOM_ENTERPRISE_ID: 'ent',
        PROVIDER_DG_CUSTOM_USER_ID: 'user-1',
        PROVIDER_DG_CUSTOM_IDE_NAME: 'Cursor',
        MODEL_CHAT: 'dg-custom:claude-opus-4.8-1m',
      }),
    );
    expect(env.llm.providers['dg-custom']).toMatchObject({
      kind: 'dg-custom',
      baseUrl: 'https://copilot.tencent.com/v2',
      apiKey: 'ck_test',
      enterpriseId: 'ent',
      userId: 'user-1',
      ideName: 'Cursor',
    });
    expect(env.llm.models.chat).toEqual({
      provider: 'dg-custom',
      model: 'claude-opus-4.8-1m',
      id: 'dg-custom:claude-opus-4.8-1m',
    });
  });

  it('模型别名引用未声明的 provider 时报错', () => {
    expect(() => parseServerEnv(baseTestEnv({ MODEL_CHAT: 'nope:x' }))).toThrow(/MODEL_CHAT.*nope/);
  });

  it('启用口令必须配 COOKIE_SECRET；MODEL_CAPS_* 为 JSON', () => {
    expect(() => parseServerEnv(baseTestEnv({ ACCESS_PASSWORD: '12345678' }))).toThrow(/COOKIE_SECRET/);
    expect(() => parseServerEnv(baseTestEnv({ MODEL_CAPS_CHAT: 'jsonMode' }))).toThrow(/MODEL_CAPS_CHAT/);
    const env = parseServerEnv(baseTestEnv({ MODEL_CAPS_CHAT: '{"jsonMode":true}' }));
    expect(env.llm.caps.chat).toEqual({ jsonMode: true });
  });

  it('生产环境默认关闭开发路由、开启静态托管与 Secure Cookie', () => {
    const env = parseServerEnv(baseTestEnv({ NODE_ENV: 'production' }));
    expect(env.enableDevRoutes).toBe(false);
    expect(env.serveStatic).toBe(true);
    expect(env.access.cookieSecure).toBe(true);
  });
});
