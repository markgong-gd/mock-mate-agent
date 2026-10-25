/**
 * @file 【集成测试】C1 简历定制
 * 真实 Postgres + 假模型：未同意不能解析；确认后事实被向量化；生成的简历能导出；
 * 编造引用的版本返回 409；检索不会看到另一个用户的事实。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { confirmProfile, extractProfile } from '@/backend/core/profile.service';
import { closePool, getPool } from '@/backend/db/client';
import { runMigrations } from '@/backend/db/migrate';
import { ensureUser } from '@/backend/db/repos/users';
import { searchFacts } from '@/backend/db/vector';
import { createApp } from '@/backend/server/app';
import { hashEmbed } from '@/agent/llm/embeddings';
import { getEmbeddings, resetEmbeddingsForTesting } from '@/agent/llm/embeddings';
import { newId } from '@/shared/common/ids';
import { TEST_USER_ID, useTestEnv } from '../helpers/env';

const ctx = { userId: TEST_USER_ID, requestId: 'req-p1-0001' };
const OTHER_USER = '00000000-0000-4000-8000-0000000000bb';

async function resetUserData(userId: string) {
  const pool = getPool();
  await pool.query('delete from consents where user_id = $1', [userId]);
  await pool.query('delete from job_targets where user_id = $1', [userId]);
  await pool.query('delete from profiles where user_id = $1', [userId]);
}

beforeAll(async () => {
  useTestEnv();
  resetEmbeddingsForTesting();
  await runMigrations();
  await ensureUser(TEST_USER_ID);
  await ensureUser(OTHER_USER);
  await resetUserData(TEST_USER_ID);
});

afterAll(async () => {
  await closePool();
});

describe('integration: C1 resume', () => {
  it('未同意不能解析；同意后抽取结果不含手机号，保存后事实有向量', async () => {
    const app = createApp();
    const blocked = await app.request('/api/profile/extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: '手机 13812345678，负责 React 性能优化，把首屏从 4 秒降到 1 秒。' }),
    });
    expect(blocked.status).toBe(403);

    const consent = await app.request('/api/consents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ purpose: 'resume_parse', version: '2026-10-24' }),
    });
    expect(consent.status).toBe(200);

    const extracted = await extractProfile(
      ctx,
      '手机 13812345678，邮箱 a@example.com。负责 React 性能优化，把首屏从 4 秒降到 1 秒。',
    );
    expect(JSON.stringify(extracted.draft)).not.toContain('13812345678');
    expect(JSON.stringify(extracted.draft)).not.toContain('a@example.com');
    expect(extracted.draft.skills.some((skill) => skill.tag === 'react')).toBe(true);

    const saved = await confirmProfile(ctx, {
      ...extracted.draft,
      contact: { name: '测试用户', phone: '13812345678', email: 'a@example.com' },
    });
    expect(saved.profile.contact.phone).toBe('13812345678');
    const vectors = await getPool().query<{ embed_model: string | null; ready: boolean }>(
      'select embed_model, embedding is not null as ready from facts where user_id = $1',
      [TEST_USER_ID],
    );
    expect(vectors.rows.length).toBeGreaterThan(0);
    expect(vectors.rows.every((row) => row.ready && row.embed_model === getEmbeddings().id)).toBe(true);
  });

  it('JD 匹配度能看出缺口；生成的简历可导出；编造引用返回 409；检索不跨用户', async () => {
    const app = createApp();
    const created = await app.request('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jdText: '高级前端工程师\n必须熟悉 React 与 Vue' }),
    });
    expect(created.status).toBe(200);
    const createdBody = (await created.json()) as {
      job: { id: string };
      match: { matched: { tag: string }[]; missing: { tag: string }[] };
    };
    expect(createdBody.match.matched.map((item) => item.tag)).toContain('react');
    expect(createdBody.match.missing.map((item) => item.tag)).toContain('vue');

    const generated = await app.request('/api/resumes/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId: createdBody.job.id }),
    });
    expect(generated.status).toBe(200);
    expect(generated.headers.get('content-type')).toContain('text/plain');
    const streamed = await generated.text();
    expect(streamed.trim().startsWith('{')).toBe(true);

    const list = await app.request(`/api/resumes?jobId=${createdBody.job.id}`);
    expect(list.status).toBe(200);
    const listed = (await list.json()) as {
      resumes: {
        id: string;
        content: { sections: { bullets: { status: string; factRefs: string[] }[] }[] };
      }[];
    };
    const resume = listed.resumes[0];
    expect(resume).toBeTruthy();
    expect(resume!.content.sections[0]?.bullets[0]?.status).toBe('verified');

    const exported = await app.request(`/api/resumes/${resume!.id}/export`);
    expect(exported.status).toBe(200);
    const exportBody = (await exported.json()) as { contact: { name: string } };
    expect(exportBody.contact.name).toBe('测试用户');

    const bad = await app.request(`/api/resumes/${resume!.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        headline: '前端工程师',
        summary: '摘要足够长',
        sections: [
          {
            heading: '经历',
            bullets: [
              {
                text: '编造了一段没有事实支撑的经历',
                factRefs: ['99999999-9999-4999-8999-999999999999'],
              },
            ],
          },
        ],
      }),
    });
    expect(bad.status).toBe(200);
    const badBody = (await bad.json()) as { resume: { id: string } };
    const denied = await app.request(`/api/resumes/${badBody.resume.id}/export`);
    expect(denied.status).toBe(409);

    const otherFactId = newId();
    const experienceId = newId();
    const profileId = newId();
    await getPool().query('delete from profiles where user_id = $1', [OTHER_USER]);
    await getPool().query(
      `insert into profiles (id, user_id, name, headline, summary) values ($1, $2, '别人', '工程师', '摘要')`,
      [profileId, OTHER_USER],
    );
    await getPool().query(
      `insert into experiences (id, user_id, profile_id, company, title, start_date, summary, sort_order)
       values ($1, $2, $3, '别处', '工程师', '2020-01', '', 0)`,
      [experienceId, OTHER_USER, profileId],
    );
    const vector = hashEmbed('React 性能优化');
    await getPool().query(
      `insert into facts (id, user_id, experience_id, text, embedding, embed_model, sort_order)
       values ($1, $2, $3, '别人的 React 性能优化', $4::vector, $5, 0)`,
      [otherFactId, OTHER_USER, experienceId, `[${vector.join(',')}]`, getEmbeddings().id],
    );
    const hits = await searchFacts({
      userId: TEST_USER_ID,
      vector,
      embedModel: getEmbeddings().id,
      k: 10,
    });
    expect(hits.map((hit) => hit.id)).not.toContain(otherFactId);
  });
});
