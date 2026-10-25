/**
 * @file 【集成测试】C3 诊断 + 主链路
 * 真实 Postgres + 假模型，走完「档案 → JD → 简历 → 面试 → 报告」：
 * 面试结束后自动拿到报告，逐题点评、雷达图维度、短板证据、复训计划齐全；
 * 重复触发只有一份报告；failed 可以手动重试；打分中途失败后从断点续跑，分数不叠加。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { embedQuestions } from '@/backend/core/question-embed.service';
import { confirmProfile, extractProfile } from '@/backend/core/profile.service';
import {
  getReportView,
  requestDiagnosis,
  runDiagnosis,
  setDiagnosisGraphForTesting,
} from '@/backend/core/diagnosis.service';
import { setInterviewGraphForTesting } from '@/backend/core/interview.service';
import { closePool, getPool } from '@/backend/db/client';
import { runMigrations } from '@/backend/db/migrate';
import { ensureUser } from '@/backend/db/repos/users';
import { setReportStatus } from '@/backend/db/repos/diagnosis';
import { seedQuestionBank } from '@/backend/db/seed-questions';
import { seedRubrics } from '@/backend/db/seed-rubrics';
import { buildDiagnosisGraph, defaultDiagnosisDeps } from '@/agent/graphs/diagnosis/graph';
import { getCheckpointer, setupCheckpointer } from '@/agent/graphs/checkpointer';
import { createApp } from '@/backend/server/app';
import { TEST_USER_ID, useTestEnv } from '../helpers/env';

const ctx = { userId: TEST_USER_ID, requestId: 'req-p2b-0001' };

const DEEP_1 = '我把列表 key 换成稳定的业务 id，插入和排序之后行的输入状态不会串到别的行，回归也补了用例。';
const DEEP_2 =
  '首屏变慢我先看 LCP 和接口耗时，区分是接口慢还是渲染慢，再决定加缓存还是拆包，最后从 4 秒降到 1 秒。';

async function resetUserData(userId: string) {
  const pool = getPool();
  await pool.query('delete from interview_sessions where user_id = $1', [userId]);
  await pool.query('delete from consents where user_id = $1', [userId]);
  await pool.query('delete from job_targets where user_id = $1', [userId]);
  await pool.query('delete from profiles where user_id = $1', [userId]);
}

async function chat(
  app: ReturnType<typeof createApp>,
  sessionId: string,
  body: { answer: string; idempotencyKey?: string },
) {
  const res = await app.request(`/api/interviews/${sessionId}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  await res.text();
  return res;
}

/** 档案 → JD → 简历 → 一场两题的面试，返回面试 id */
async function runMainChain(app: ReturnType<typeof createApp>): Promise<string> {
  const consent = await app.request('/api/consents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ purpose: 'resume_parse', version: '2026-10-24' }),
  });
  expect(consent.status).toBe(200);

  const extracted = await extractProfile(
    ctx,
    '负责 React 列表性能优化，把首屏从 4 秒降到 1 秒，并补齐了单元测试。',
  );
  const saved = await confirmProfile(ctx, {
    ...extracted.draft,
    contact: { name: '测试用户', phone: '', email: '' },
  });
  expect(saved.profile.experiences.length).toBeGreaterThan(0);

  const createdJob = await app.request('/api/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jdText: '高级前端工程师\n必须熟悉 React 与前端性能优化' }),
  });
  expect(createdJob.status).toBe(200);
  const job = (await createdJob.json()) as { job: { id: string } };

  const generated = await app.request('/api/resumes/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jobId: job.job.id }),
  });
  expect(generated.status).toBe(200);
  await generated.text();

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
        maxFollowUps: 0,
      },
    }),
  });
  expect(created.status).toBe(201);
  const session = (await created.json()) as { id: string };

  expect((await chat(app, session.id, { answer: '' })).status).toBe(200);
  expect((await chat(app, session.id, { answer: DEEP_1, idempotencyKey: 'p2b-1' })).status).toBe(200);
  expect((await chat(app, session.id, { answer: DEEP_2, idempotencyKey: 'p2b-2' })).status).toBe(200);
  return session.id;
}

beforeAll(async () => {
  useTestEnv();
  await runMigrations();
  await setupCheckpointer();
  await ensureUser(TEST_USER_ID);
  await resetUserData(TEST_USER_ID);
  await seedRubrics();
  await seedQuestionBank();
  await embedQuestions();
});

afterAll(async () => {
  setInterviewGraphForTesting(undefined);
  setDiagnosisGraphForTesting(undefined);
  await closePool();
});

describe('integration: 主链路与 C3 诊断', () => {
  it('档案 → JD → 简历 → 面试 → 报告：报告齐全，重复触发只有一份', async () => {
    const app = createApp();
    const sessionId = await runMainChain(app);

    const finished = await app.request(`/api/interviews/${sessionId}/finish`, { method: 'POST' });
    expect(finished.status).toBe(200);
    expect(((await finished.json()) as { status: string }).status).toBe('finished');

    const listed = await app.request(`/api/reports?sessionId=${sessionId}`);
    expect(listed.status).toBe(200);
    const { reports } = (await listed.json()) as {
      reports: { id: string; status: string; rubricVersion: string; overall: number | null }[];
    };
    expect(reports).toHaveLength(1);
    const summary = reports[0]!;
    expect(summary.status).toBe('done');
    expect(summary.rubricVersion).toBe('v1');
    expect(summary.overall).toBeGreaterThan(0);

    const detail = await app.request(`/api/reports/${summary.id}`);
    expect(detail.status).toBe(200);
    const report = (await detail.json()) as {
      status: string;
      rubric: { version: string; dimensions: { key: string }[] } | null;
      scores: {
        overall: number;
        dimensions: { key: string; score: number }[];
        skills: { tag: string; count: number }[];
        answers: { turnId: string; comment: string; dimensions: unknown[]; score: number }[];
      } | null;
      plan: { items: { tag: string }[] } | null;
      weaknesses: { tag: string; evidenceTurnId: string | null; evidenceQuote: string }[];
      turns: { id: string; role: string; content: string }[];
    };

    // Rubric 版本化且对用户可见（R-C3-6）
    expect(report.rubric?.version).toBe('v1');
    expect(report.rubric?.dimensions.map((d) => d.key)).toEqual([
      'tech_depth',
      'structure',
      'job_fit',
      'communication',
    ]);

    // 逐题打分 + 雷达图维度（R-C3-1、R-C3-3）
    expect(report.scores?.answers).toHaveLength(2);
    expect(report.scores?.answers.every((a) => a.dimensions.length === 4 && a.comment.length > 0)).toBe(true);
    expect(report.scores?.dimensions).toHaveLength(4);
    expect(report.scores?.skills.length).toBeGreaterThan(0);

    // 逐题点评能配回答原文
    const turnIds = new Set(report.turns.map((turn) => turn.id));
    expect(report.scores?.answers.every((a) => turnIds.has(a.turnId))).toBe(true);

    // 每条短板都有证据，且证据原话出现在那一轮回答里（R-C3-2）
    for (const weakness of report.weaknesses) {
      expect(weakness.evidenceTurnId).toBeTruthy();
      const turn = report.turns.find((item) => item.id === weakness.evidenceTurnId);
      expect(turn?.role).toBe('user');
      expect(turn!.content.replace(/\s+/g, ' ')).toContain(weakness.evidenceQuote);
    }
    // 复训计划只针对已确认的短板（R-C3-4）
    const tags = new Set(report.weaknesses.map((w) => w.tag));
    expect(report.plan?.items.every((item) => tags.has(item.tag))).toBe(true);

    // 同一场面试再触发也只有一份报告
    const again = await requestDiagnosis(ctx, sessionId);
    expect(again.reportId).toBe(summary.id);
    expect(again.queued).toBe(false);
    const rows = await getPool().query<{ n: string }>(
      'select count(*) as n from diagnosis_reports where session_id = $1',
      [sessionId],
    );
    expect(Number(rows.rows[0]?.n)).toBe(1);

    // 技能得分历史入库，成长曲线（P3-05）直接用它
    const history = await getPool().query<{ n: string }>(
      'select count(*) as n from skill_score_history where report_id = $1',
      [summary.id],
    );
    expect(Number(history.rows[0]?.n)).toBe(report.scores!.skills.length);
  });

  it('打分中途失败：报告停在 failed，手动重试后从断点续跑且不重复打分', async () => {
    const app = createApp();
    await resetUserData(TEST_USER_ID);

    // 第二题打分抛错一次。诊断在最后一次 chat 流结束时就触发，所以要先注入图
    let failures = 1;
    const scored: string[] = [];
    setDiagnosisGraphForTesting(
      buildDiagnosisGraph(getCheckpointer(), {
        ...defaultDiagnosisDeps,
        beforeScore: (turnId) => {
          scored.push(turnId);
          if (scored.length === 2 && failures > 0) {
            failures -= 1;
            throw new Error('score failed');
          }
        },
      }),
    );

    const sessionId = await runMainChain(app);

    const listed = (await (await app.request(`/api/reports?sessionId=${sessionId}`)).json()) as {
      reports: { id: string; status: string }[];
    };
    expect(listed.reports).toHaveLength(1);
    const reportId = listed.reports[0]!.id;
    // 面试照常结束，报告停在 failed，不牵连面试请求
    expect(listed.reports[0]!.status).toBe('failed');
    const failedView = await getReportView(ctx, reportId);
    expect(failedView.error).toContain('score failed');
    expect(failedView.scores).toBeNull();

    const firstRound = scored.length;
    const retried = await app.request(`/api/reports/${reportId}/retry`, { method: 'POST' });
    expect(retried.status).toBe(200);
    const after = await getReportView(ctx, reportId);
    expect(after.status).toBe('done');
    expect(after.scores?.answers).toHaveLength(2);
    /**
     * 续跑从断点开始，不会把 load 和聚合重做一遍，分数也不会叠加（上一行已经验证只有 2 条）。
     * 但并行分支里有一个"打分前就抛错"的分支时，还在途中的分支会被一起中止，
     * 它的 putWrites 没落下来，所以重跑的题数是 1 到 2 题，不能写死成 1。
     */
    expect(scored.length).toBeGreaterThan(firstRound);
    expect(scored.length).toBeLessThanOrEqual(firstRound + 2);

    // 已经 done 的报告不允许再重试
    const denied = await app.request(`/api/reports/${reportId}/retry`, { method: 'POST' });
    expect(denied.status).toBe(409);

    // 状态被外部改回 failed 后重跑：从头再诊断一次，分数不会叠加成 4 条
    await setReportStatus(TEST_USER_ID, reportId, 'failed', '人工置为失败');
    await runDiagnosis({ userId: TEST_USER_ID, reportId }, ctx.requestId);
    const rerun = await getReportView(ctx, reportId);
    expect(rerun.status).toBe('done');
    expect(rerun.scores?.answers).toHaveLength(2);
    expect(rerun.weaknesses.length).toBe(after.weaknesses.length);
  });
});
