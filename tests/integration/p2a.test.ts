/**
 * @file 【集成测试】C2 文字面试与题库检索
 * 真实 Postgres + 假模型：题库入库并向量化，检索 recall@k 达标，
 * 一场面试能追问、幂等回放、并发 409，进程内重建存档后回答还在，结束后不能再聊。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { embedQuestions } from '@/backend/core/question-embed.service';
import { closePool, getPool } from '@/backend/db/client';
import { runMigrations } from '@/backend/db/migrate';
import { seedQuestionBank } from '@/backend/db/seed-questions';
import { ensureUser } from '@/backend/db/repos/users';
import { resetCheckpointerForTesting, setupCheckpointer } from '@/agent/graphs/checkpointer';
import { QuestionRetriever } from '@/agent/retrieval/question-retriever';
import { getEmbeddings } from '@/agent/llm/embeddings';
import { setInterviewGraphForTesting } from '@/backend/core/interview.service';
import { createApp } from '@/backend/server/app';
import { meanRecallAtK } from '@/shared/domain/retrieval/recall';
import { TEST_USER_ID, useTestEnv } from '../helpers/env';

interface EvalFile {
  k: number;
  minMeanRecall: number;
  cases: { id: string; skills: string[]; text: string; expected: string[] }[];
}

const evalFile = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '../../evals/retrieval/questions.json'), 'utf8'),
) as EvalFile;

function textOf(body: string): string {
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .map((line) => {
      try {
        return JSON.parse(line.slice(5).trim()) as { type?: string; delta?: string };
      } catch {
        return null;
      }
    })
    .filter((chunk): chunk is { type: string; delta?: string } => chunk?.type === 'text-delta')
    .map((chunk) => chunk.delta ?? '')
    .join('');
}

function statesOf(
  body: string,
): { total?: number; followUpCount?: number; phase?: string; status?: string }[] {
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .flatMap((line) => {
      try {
        const chunk = JSON.parse(line.slice(5).trim()) as { type?: string; data?: { total?: number } };
        return chunk.type === 'data-interview-state' && chunk.data ? [chunk.data] : [];
      } catch {
        return [];
      }
    });
}

async function chat(
  app: ReturnType<typeof createApp>,
  sessionId: string,
  body: { answer: string; idempotencyKey?: string },
) {
  return app.request(`/api/interviews/${sessionId}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  useTestEnv();
  await runMigrations();
  await setupCheckpointer();
  await ensureUser(TEST_USER_ID);
  await getPool().query('delete from interview_sessions where user_id = $1', [TEST_USER_ID]);
  await seedQuestionBank();
  await embedQuestions();
});

afterAll(async () => {
  setInterviewGraphForTesting(undefined);
  await closePool();
});

describe('integration: question retrieval', () => {
  it(`recall@${evalFile.k} 的平均值不低于 ${evalFile.minMeanRecall}`, async () => {
    const retriever = new QuestionRetriever();
    const scored = [];
    for (const item of evalFile.cases) {
      const hits = await retriever.retrieve({ skills: item.skills, text: item.text, k: evalFile.k });
      scored.push({ expected: item.expected, retrieved: hits.map((hit) => hit.id), label: item.id });
    }
    const mean = meanRecallAtK(scored, evalFile.k);
    const missed = scored
      .filter((item) => !item.expected.every((id) => item.retrieved.slice(0, evalFile.k).includes(id)))
      .map((item) => `${item.label} → ${item.retrieved.slice(0, evalFile.k).join(',') || '(空)'}`);
    expect(mean, missed.join(' | ') || 'all hit').toBeGreaterThanOrEqual(evalFile.minMeanRecall);
  });

  it('中断后再次向量化只补未完成的行', async () => {
    const before = await getPool().query<{ id: string; embedding: string }>(
      `select id, embedding::text as embedding from questions where id in ('fe-react-001', 'fe-css-001')`,
    );
    const css = before.rows.find((row) => row.id === 'fe-css-001')?.embedding;
    await getPool().query(`update questions set embedding = null where id = 'fe-react-001'`);
    const again = await embedQuestions();
    expect(again.embedded).toBe(1);
    const after = await getPool().query<{ id: string; embedding: string | null; embed_model: string | null }>(
      `select id, embedding::text as embedding, embed_model from questions where id in ('fe-react-001', 'fe-css-001')`,
    );
    const react = after.rows.find((row) => row.id === 'fe-react-001');
    const cssAfter = after.rows.find((row) => row.id === 'fe-css-001');
    expect(react?.embedding).toBeTruthy();
    expect(react?.embed_model).toBe(getEmbeddings().id);
    expect(cssAfter?.embedding).toBe(css);
  });
});

describe('integration: text interview', () => {
  it('设置生效，浅回答会追问，重复提交不添轮次，并发 409，重启后续跑，结束后不能再聊', async () => {
    const app = createApp();
    const createdJob = await app.request('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jdText: '高级前端工程师\n必须熟悉 React' }),
    });
    expect(createdJob.status).toBe(200);
    const job = (await createdJob.json()) as { job: { id: string } };

    const created = await app.request('/api/interviews', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jobId: job.job.id,
        settings: {
          questionCount: 2,
          difficultyMin: 1,
          difficultyMax: 5,
          style: 'standard',
          maxFollowUps: 1,
        },
      }),
    });
    expect(created.status).toBe(201);
    const session = (await created.json()) as { id: string; settings: { questionCount: number } };
    expect(session.settings.questionCount).toBe(2);

    const opening = await chat(app, session.id, { answer: '' });
    expect(opening.status).toBe(200);
    const openingBody = await opening.text();
    const openingText = textOf(openingBody);
    expect(openingText.length).toBeGreaterThan(0);
    expect(openingText).not.toContain('needFollowUp');
    expect(statesOf(openingBody).some((state) => state.total === 2)).toBe(true);

    const answer = await chat(app, session.id, { answer: '不知道', idempotencyKey: 'turn-shallow-1' });
    expect(answer.status).toBe(200);
    const answerBody = await answer.text();
    expect(textOf(answerBody)).toContain('具体一点');
    expect(statesOf(answerBody).some((state) => state.followUpCount === 1)).toBe(true);

    const viewed = await app.request(`/api/interviews/${session.id}`);
    const view = (await viewed.json()) as {
      turns: { role: string; content: string }[];
      progress: { followUpCount: number; total: number; phase: string };
    };
    expect(view.turns.filter((turn) => turn.role === 'user').map((turn) => turn.content)).toEqual(['不知道']);
    expect(view.progress.total).toBe(2);
    expect(view.progress.followUpCount).toBe(1);
    const turnCount = view.turns.length;

    const replay = await chat(app, session.id, { answer: '不知道', idempotencyKey: 'turn-shallow-1' });
    expect(replay.status).toBe(200);
    expect(textOf(await replay.text())).toContain('具体一点');
    const afterReplay = (await (await app.request(`/api/interviews/${session.id}`)).json()) as {
      turns: unknown[];
    };
    expect(afterReplay.turns.length).toBe(turnCount);

    const [first, second] = await Promise.all([
      chat(app, session.id, {
        answer: '我当时用稳定 id 做列表 key，插入后状态没有串行。',
        idempotencyKey: 'turn-deep-1',
      }),
      chat(app, session.id, { answer: '另一条并发回答', idempotencyKey: 'turn-deep-2' }),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);
    const winner = first.status === 200 ? first : second;
    const winnerText = textOf(await winner.text());
    expect(winnerText).not.toContain('needFollowUp');

    resetCheckpointerForTesting();
    setInterviewGraphForTesting(undefined);
    const restored = (await (await app.request(`/api/interviews/${session.id}`)).json()) as {
      turns: { role: string; content: string }[];
    };
    expect(restored.turns.some((turn) => turn.role === 'user' && turn.content === '不知道')).toBe(true);

    const continued = await chat(app, session.id, {
      answer: '下一题我按主路径拆过范围，先交能演示的那一块，其余写进后续。',
      idempotencyKey: 'turn-next-1',
    });
    expect(continued.status).toBe(200);
    await continued.text();

    const finished = await app.request(`/api/interviews/${session.id}/finish`, { method: 'POST' });
    expect(finished.status).toBe(200);
    const done = (await finished.json()) as { status: string; progress: { phase: string } };
    expect(done.status).toBe('finished');
    expect(done.progress.phase).toBe('finished');

    const denied = await chat(app, session.id, {
      answer: '还想再说一句',
      idempotencyKey: 'turn-after-finish',
    });
    expect(denied.status).toBe(409);
  });
});
