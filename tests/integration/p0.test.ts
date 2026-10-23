/**
 * @file 【集成测试】真实 Postgres + 假模型
 * 覆盖：迁移启用扩展与存档 schema；readyz 与 ping 写入 llm_calls；回声图中断 → 模拟进程重启 → resume 继续。
 * 运行：pnpm test:integration（需要 mockmate_test 库或 TEST_DATABASE_URL）。
 */
import type { UIMessageChunk } from 'ai';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getEchoThread, setEchoGraphForTesting, streamEchoTurn } from '@/backend/core/dev.service';
import { closePool, getPool } from '@/backend/db/client';
import { runMigrations } from '@/backend/db/migrate';
import { listRecentLlmCalls } from '@/backend/db/repos/llm-calls';
import { ensureUser } from '@/backend/db/repos/users';
import { resetCheckpointerForTesting, setupCheckpointer } from '@/agent/graphs/checkpointer';
import { createApp } from '@/backend/server/app';
import { readAll, TEST_USER_ID, useTestEnv } from '../helpers/env';

const ctx = { userId: TEST_USER_ID, requestId: 'req-int-0001' };

const textOf = (chunks: UIMessageChunk[]) =>
  chunks
    .filter((c): c is Extract<UIMessageChunk, { type: 'text-delta' }> => c.type === 'text-delta')
    .map((c) => c.delta)
    .join('');

async function waitFor<T>(fn: () => Promise<T>, ok: (v: T) => boolean, timeoutMs = 3000): Promise<T> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (ok(v) || Date.now() > until) return v;
    await new Promise((r) => setTimeout(r, 50));
  }
}

beforeAll(async () => {
  useTestEnv();
  await runMigrations();
  await ensureUser(TEST_USER_ID);
  await setupCheckpointer();
});

afterAll(async () => {
  setEchoGraphForTesting(undefined);
  await closePool();
});

describe('integration: db + checkpointer', () => {
  it('迁移启用了 vector / pg_trgm，存档在 langgraph schema', async () => {
    const ext = await getPool().query<{ extname: string }>(
      "select extname from pg_extension where extname in ('vector','pg_trgm') order by 1",
    );
    expect(ext.rows.map((r) => r.extname)).toEqual(['pg_trgm', 'vector']);
    const tables = await getPool().query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'langgraph'",
    );
    expect(tables.rows.map((r) => r.table_name)).toContain('checkpoints');
  });

  it('readyz 检查 DB；ping 写入 llm_calls（只有元数据）', async () => {
    const app = createApp();
    expect((await app.request('/api/readyz')).status).toBe(200);
    const res = await app.request('/api/llm/ping?alias=chat');
    expect(res.status).toBe(200);
    const requestId = res.headers.get('x-request-id');
    const rows = await waitFor(
      () => listRecentLlmCalls(TEST_USER_ID, { limit: 5 }),
      (r) => r.some((x) => x.requestId === requestId),
    );
    const row = rows.find((x) => x.requestId === requestId);
    expect(row).toMatchObject({ functionId: 'llm.ping', alias: 'chat', model: 'fake:echo', status: 'ok' });
    expect(Object.keys(row!)).not.toContain('content');
  });

  it('回声图：中断 → 进程重启（新的 PostgresSaver 与图实例）→ resume 继续', async () => {
    const threadId = `it-${Date.now()}`;
    const first = await readAll(await streamEchoTurn(ctx, { threadId, answer: '' }));
    expect(textOf(first)).toContain('第 1 个问题');

    resetCheckpointerForTesting();
    setEchoGraphForTesting(undefined);

    const view = await getEchoThread(ctx, threadId);
    expect(view.next).toEqual(['wait_answer']);
    expect(view.messages).toHaveLength(1);

    const second = await readAll(await streamEchoTurn(ctx, { threadId, answer: '重启之后的回答' }));
    expect(textOf(second)).toContain('重启之后的回答');
    expect(textOf(second)).toContain('第 2 个问题');

    const calls = await waitFor(
      () => listRecentLlmCalls(TEST_USER_ID, { sessionId: threadId }),
      (r) => r.length >= 3,
    );
    expect(calls.map((c) => c.functionId).sort()).toEqual(['dev.echo.ask', 'dev.echo.ask', 'dev.echo.reply']);
    expect(calls.every((c) => c.promptVersion === 'dev-echo@1')).toBe(true);
  });
});
