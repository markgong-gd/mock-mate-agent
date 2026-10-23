/**
 * @file 【测试】Hono 应用：requestId、统一错误契约、开发路由开关、ping、accessGate 口令流程
 */
import { afterEach, describe, expect, it } from 'vitest';
import { setServerEnvForTesting } from '@/shared/env/server';
import { isApiError } from '@/shared/common/errors';
import { TEST_USER_ID, useTestEnv } from '../../../tests/helpers/env';
import { createApp, type AppConfig } from './app';

const SECRET = 'x'.repeat(32);
const cfg = (over: Partial<AppConfig> = {}): AppConfig => ({
  devUserId: TEST_USER_ID,
  access: { cookieSecure: false },
  enableDevRoutes: false,
  ...over,
});

afterEach(() => setServerEnvForTesting(undefined));

describe('app', () => {
  it('healthz 可用；响应带 X-Request-Id，并透传合法的请求 id', async () => {
    const app = createApp(cfg());
    const res = await app.request('/api/healthz', { headers: { 'x-request-id': 'my-request-0001' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toBe('my-request-0001');
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it('错误统一为 { code, message, requestId }', async () => {
    useTestEnv();
    const app = createApp(cfg());
    const notFound = await app.request('/api/nope');
    expect(notFound.status).toBe(404);
    const body = await notFound.json();
    expect(isApiError(body)).toBe(true);
    expect(body).toMatchObject({ code: 'NOT_FOUND', requestId: notFound.headers.get('x-request-id') });

    const invalid = await app.request('/api/llm/ping?alias=bad');
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ code: 'VALIDATION', details: [{ path: 'alias' }] });
  });

  it('关闭开发路由时 /api/dev/* 返回 404', async () => {
    const res = await createApp(cfg()).request('/api/dev/graphs/echo/mermaid');
    expect(res.status).toBe(404);
  });

  it('ping 走注册表并返回模型信息', async () => {
    useTestEnv();
    const res = await createApp(cfg()).request('/api/llm/ping?alias=chat');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ alias: 'chat', model: 'fake:echo', reply: 'pong' });
  });
});

describe('accessGate', () => {
  const gated = () =>
    createApp(cfg({ access: { password: 'correct-horse', cookieSecret: SECRET, cookieSecure: false } }));

  it('未通过口令：API 401、页面返回口令页、healthz 放行', async () => {
    const app = gated();
    expect((await app.request('/api/meta')).status).toBe(401);
    expect((await (await app.request('/api/meta')).json()).code).toBe('UNAUTHORIZED');
    const page = await app.request('/');
    expect(page.status).toBe(401);
    expect(await page.text()).toContain('访问口令');
    expect((await app.request('/api/healthz')).status).toBe(200);
  });

  it('口令错误 401；正确后签发 httpOnly Cookie 并可访问', async () => {
    const app = gated();
    const login = (password: string) =>
      app.request('/api/access/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
    expect((await login('wrong-pass')).status).toBe(401);

    const ok = await login('correct-horse');
    expect(ok.status).toBe(200);
    const setCookie = ok.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/mm_access=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);

    const cookie = setCookie.split(';')[0]!;
    const status = await app.request('/api/access/status', { headers: { cookie } });
    expect(await status.json()).toEqual({ enabled: true, granted: true });
    expect((await app.request('/api/healthz', { headers: { cookie } })).status).toBe(200);

    const tampered = cookie.replace(/mm_access=v1\.\d+/, 'mm_access=v1.1');
    expect((await app.request('/api/access/status', { headers: { cookie: tampered } })).status).toBe(200);
    expect(
      await (await app.request('/api/access/status', { headers: { cookie: tampered } })).json(),
    ).toMatchObject({
      granted: false,
    });
  });

  it('修改口令后旧 Cookie 失效', async () => {
    const a = gated();
    const res = await a.request('/api/access/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct-horse' }),
    });
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    const b = createApp(
      cfg({ access: { password: 'another-pass', cookieSecret: SECRET, cookieSecure: false } }),
    );
    expect((await b.request('/api/meta', { headers: { cookie } })).status).toBe(401);
  });
});
