/**
 * @file 【集成测试】P3 复训闭环 + 用量 + PII 脱敏
 * 真实 Postgres + 假模型，按顺序跑完一条闭环：
 *   第一场面试 → 诊断 → 短板写回档案 → 第二场自动针对短板出题 → 专项训练 → 成长曲线 →
 *   单场用量与成本 → PII 不进模型 → 模型失败时回答不丢且能续跑。
 * 这些 it 之间有先后依赖（共享 jobId / sessionId / reportId），依赖 vitest 在单文件内顺序执行。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { embedQuestions } from '@/backend/core/question-embed.service';
import { closePool, getPool } from '@/backend/db/client';
import { runMigrations } from '@/backend/db/migrate';
import { ensureUser } from '@/backend/db/repos/users';
import { seedQuestionBank } from '@/backend/db/seed-questions';
import { seedRubrics } from '@/backend/db/seed-rubrics';
import { setupCheckpointer } from '@/agent/graphs/checkpointer';
import { setDiagnosisGraphForTesting } from '@/backend/core/diagnosis.service';
import { setInterviewGraphForTesting } from '@/backend/core/interview.service';
import { createApp } from '@/backend/server/app';
import { limits } from '@/backend/core/config';
import type { GrowthView } from '@/shared/schemas/growth';
import type { InterviewSummary } from '@/shared/schemas/interview';
import type { QueuedQuestion } from '@/shared/schemas/question';
import type { SessionUsage } from '@/shared/schemas/usage';
import type { ProfileWeakness } from '@/shared/schemas/weakness';
import { TEST_USER_ID, useTestEnv } from '../helpers/env';

const DEEP_REACT =
  '我把列表 key 换成稳定的业务 id，插入和排序之后行的输入状态不会串到别的行，回归也补了用例。';
const DEEP_HOOKS =
  '我用 useMemo 缓存派生数据，再把回调用 useCallback 固定引用，重渲染次数从每秒十几次降到两三次。';
const PHONE = '13800138000';
const EMAIL = 'li.si@example.com';
const ID_CARD = '11010519491231002X';

type App = ReturnType<typeof createApp>;

let app: App;
let jobId = '';
let firstSessionId = '';
let secondSessionId = '';
let secondReportId = '';
let weaknessTag = '';

async function chat(sessionId: string, body: { answer: string; idempotencyKey?: string }) {
  const res = await app.request(`/api/interviews/${sessionId}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.text() };
}

/** SSE 里的面试官文本 */
function textOf(body: string): string {
  return parts(body)
    .filter((part) => part.type === 'text-delta')
    .map((part) => (part as { delta?: string }).delta ?? '')
    .join('');
}

function parts(body: string): { type?: string }[] {
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .flatMap((line) => {
      try {
        return [JSON.parse(line.slice(5).trim()) as { type?: string }];
      } catch {
        return [];
      }
    });
}

const streamError = (body: string) =>
  parts(body).find((part) => part.type === 'error') as { errorText?: string } | undefined;

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await app.request(path, init);
  expect(res.status, `${path} -> ${res.status}`).toBeLessThan(300);
  return (await res.json()) as T;
}

const post = (path: string, body?: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

/** 面试图存档里的题目队列（只有开发路由能看到，用来验证"出题真的命中短板"） */
async function questionQueue(sessionId: string): Promise<QueuedQuestion[]> {
  const state = await json<{ values: { questionQueue?: QueuedQuestion[] } }>(
    `/api/dev/threads/${sessionId}/state?graph=interview`,
  );
  return state.values.questionQueue ?? [];
}

async function createInterview(count: number, maxFollowUps = 0): Promise<string> {
  const session = await json<InterviewSummary>(
    '/api/interviews',
    post('/api/interviews', {
      jobId,
      settings: { questionCount: count, difficultyMin: 1, difficultyMax: 5, style: 'standard', maxFollowUps },
    }),
  );
  return session.id;
}

async function finish(sessionId: string) {
  const res = await app.request(`/api/interviews/${sessionId}/finish`, { method: 'POST' });
  expect(res.status).toBe(200);
  await res.text();
}

async function reportOf(sessionId: string): Promise<{ id: string; status: string }> {
  const listed = await json<{ reports: { id: string; status: string }[] }>(
    `/api/reports?sessionId=${sessionId}`,
  );
  expect(listed.reports).toHaveLength(1);
  return listed.reports[0]!;
}

beforeAll(async () => {
  useTestEnv();
  app = createApp();
  await runMigrations();
  await setupCheckpointer();
  await ensureUser(TEST_USER_ID);
  // 闭环要数"这个技能被判为短板几次"，所以必须从干净的历史开始
  await getPool().query('delete from interview_sessions where user_id = $1', [TEST_USER_ID]);
  await getPool().query('delete from job_targets where user_id = $1', [TEST_USER_ID]);
  await getPool().query('delete from llm_calls where user_id = $1', [TEST_USER_ID]);
  await seedRubrics();
  await seedQuestionBank();
  await embedQuestions();

  // JD 只写 React：这样两场面试考的都是 react，成长曲线上才会有同一技能的多个点
  const job = await json<{ job: { id: string } }>(
    '/api/jobs',
    post('/api/jobs', { jdText: '高级前端工程师\n必须熟悉 React' }),
  );
  jobId = job.job.id;
});

afterAll(async () => {
  setInterviewGraphForTesting(undefined);
  setDiagnosisGraphForTesting(undefined);
  await closePool();
});

describe('integration: P3 复训闭环', () => {
  it('第一场面试结束后，短板写回职业档案（R-P3）', async () => {
    firstSessionId = await createInterview(2);
    expect((await chat(firstSessionId, { answer: '' })).status).toBe(200);
    expect((await chat(firstSessionId, { answer: DEEP_REACT, idempotencyKey: 'p3-1' })).status).toBe(200);
    // 一句"不知道"保证一定能抽出短板
    expect((await chat(firstSessionId, { answer: '不知道', idempotencyKey: 'p3-2' })).status).toBe(200);
    await finish(firstSessionId);

    const report = await reportOf(firstSessionId);
    expect(report.status).toBe('done');

    const profile = await json<{ weaknesses: ProfileWeakness[] }>('/api/profile');
    expect(profile.weaknesses.length).toBeGreaterThan(0);
    const first = profile.weaknesses[0]!;
    expect(first.status).toBe('open');
    expect(first.occurrences).toBe(1);
    expect(first.label.length).toBeGreaterThan(0);
    expect(first.evidenceQuote.length).toBeGreaterThan(0);
    expect(first.reportId).toBe(report.id);
    weaknessTag = first.tag;
  });

  it('第二场面试的题目优先命中历史短板（R-C2-4）', async () => {
    secondSessionId = await createInterview(2);
    expect((await chat(secondSessionId, { answer: '' })).status).toBe(200);

    const queue = await questionQueue(secondSessionId);
    expect(queue.length).toBe(2);
    // 短板题整组排在前面，并且确实带着那个技能标签
    expect(queue[0]!.weaknessMatch).toBe(true);
    expect(queue[0]!.skillTags).toContain(weaknessTag);
  });

  it('同一短板再次出现时合并成一条、次数累加（domain.merge）', async () => {
    expect((await chat(secondSessionId, { answer: DEEP_REACT, idempotencyKey: 'p3-3' })).status).toBe(200);
    expect((await chat(secondSessionId, { answer: '记不清了', idempotencyKey: 'p3-4' })).status).toBe(200);
    await finish(secondSessionId);

    const report = await reportOf(secondSessionId);
    expect(report.status).toBe('done');
    secondReportId = report.id;

    const profile = await json<{ weaknesses: ProfileWeakness[] }>('/api/profile');
    const merged = profile.weaknesses.filter((item) => item.tag === weaknessTag);
    // 去重：两场都判出来，档案里仍然只有一条
    expect(merged).toHaveLength(1);
    expect(merged[0]!.occurrences).toBe(2);
    expect(merged[0]!.reportId).toBe(secondReportId);

    const rows = await getPool().query<{ n: string }>(
      'select count(*) as n from weaknesses where user_id = $1 and tag = $2',
      [TEST_USER_ID, weaknessTag],
    );
    expect(Number(rows.rows[0]?.n)).toBe(2);
  });

  it('专项训练只针对这一条短板出题（R-C2-5）', async () => {
    const session = await json<InterviewSummary>(
      '/api/training',
      post('/api/training', { reportId: secondReportId, tag: weaknessTag }),
    );
    expect(session.kind).toBe('drill');
    expect(session.settings.drillTag).toBe(weaknessTag);

    expect((await chat(session.id, { answer: '' })).status).toBe(200);
    const queue = await questionQueue(session.id);
    expect(queue.length).toBeGreaterThan(0);
    for (const question of queue) {
      expect(question.skillTags).toContain(weaknessTag);
      expect(question.weaknessMatch).toBe(true);
    }

    // 报告里没有的短板不能拿来刷题库
    const denied = await app.request(
      '/api/training',
      post('/api/training', { reportId: secondReportId, tag: 'accessibility' }),
    );
    expect(denied.status).toBe(404);
  });

  it('成长曲线展示同一技能多次诊断的得分趋势（R-C3-5）', async () => {
    const growth = await json<GrowthView>('/api/growth');
    expect(growth.overall.map((point) => point.reportId)).toHaveLength(2);
    // 升序，便于直接画折线
    expect(growth.overall[0]!.createdAt <= growth.overall[1]!.createdAt).toBe(true);

    const skill = growth.skills.find((item) => item.tag === weaknessTag);
    expect(skill, `growth 里应该有 ${weaknessTag}`).toBeTruthy();
    expect(skill!.points).toHaveLength(2);
    expect(skill!.points[0]!.createdAt <= skill!.points[1]!.createdAt).toBe(true);
    expect(skill!.delta).toBe(Math.round((skill!.last - skill!.first) * 10) / 10);
  });
});

describe('integration: P3 用量与成本', () => {
  it('能查看单场 Token 与成本，诊断的调用也算在这一场里（N-12）', async () => {
    const usage = await json<SessionUsage>(`/api/usage/sessions/${firstSessionId}`);
    expect(usage.totals.calls).toBeGreaterThan(0);
    expect(usage.totals.inputTokens).toBeGreaterThan(0);
    expect(usage.totals.outputTokens).toBeGreaterThan(0);
    // fake provider 单价为 0，但必须是数字 0 而不是 null（null 表示"没配单价"）
    expect(usage.totals.cost).toBe(0);
    expect(usage.budget.tokenLimit).toBe(limits.sessionTokenBudget);
    expect(usage.budget.exceeded).toBe(false);

    const functionIds = usage.byFunction.map((item) => item.functionId);
    expect(functionIds).toContain('interview.ask');
    expect(functionIds).toContain('interview.evaluate');
    expect(functionIds).toContain('diagnosis.score');
    expect(functionIds).toContain('diagnosis.weakness');
  });

  it('别人的面试 id 查不到用量（N-6）', async () => {
    const res = await app.request('/api/usage/sessions/00000000-0000-4000-8000-0000000000ff');
    expect(res.status).toBe(404);
  });
});

describe('integration: P3 PII 脱敏与韧性', () => {
  it('回答里的手机号 / 邮箱 / 证件号不会进模型请求（N-3）', async () => {
    // 含糊回答会触发追问，而假模型的追问会把它收到的回答原样引一段回来：
    // 所以这段回声就是"模型究竟看到了什么"的证据（所以这一场要留一次追问额度）
    const sessionId = await createInterview(1, 1);
    expect((await chat(sessionId, { answer: '' })).status).toBe(200);

    const answered = await chat(sessionId, {
      answer: `不知道，打 ${PHONE} 或 ${EMAIL}，证件 ${ID_CARD}`,
      idempotencyKey: 'p3-pii',
    });
    expect(answered.status).toBe(200);
    const followUp = textOf(answered.body);
    expect(followUp).not.toContain(PHONE);
    expect(followUp).not.toContain(EMAIL);
    expect(followUp).not.toContain(ID_CARD);
    expect(followUp).toContain('[PHONE]');

    // 原文仍然按原样存在用户自己的轮次里（删除时随 users 级联清除）
    const view = await json<{ turns: { role: string; content: string }[] }>(`/api/interviews/${sessionId}`);
    expect(view.turns.some((turn) => turn.role === 'user' && turn.content.includes(PHONE))).toBe(true);

    // llm_calls 只有元数据，没有任何正文列
    const calls = await getPool().query<Record<string, unknown>>(
      'select * from llm_calls where user_id = $1 limit 50',
      [TEST_USER_ID],
    );
    const dump = JSON.stringify(calls.rows);
    expect(dump).not.toContain(PHONE);
    expect(dump).not.toContain(EMAIL);
    expect(dump).not.toContain(ID_CARD);
  });

  it('模型调用失败时有错误码，回答不丢，重试从断点续跑（N-9）', async () => {
    const sessionId = await createInterview(2);
    expect((await chat(sessionId, { answer: '' })).status).toBe(200);

    // 故障注入：下一次模型调用（评估）直接抛错
    const injected = await json<{ pendingFailures: number }>(
      '/api/dev/faults',
      post('/api/dev/faults', { llmFailures: 1 }),
    );
    expect(injected.pendingFailures).toBe(1);

    const failed = await chat(sessionId, { answer: DEEP_HOOKS, idempotencyKey: 'p3-fault' });
    expect(failed.status).toBe(200);
    const error = streamError(failed.body);
    expect(error, ' 流里应该带统一错误编码').toBeTruthy();
    expect(JSON.parse(error!.errorText!) as { code: string }).toMatchObject({ code: 'LLM_UNAVAILABLE' });

    // 回答已经落库，没有因为模型失败而丢掉
    const view = await json<{ turns: { role: string; content: string }[] }>(`/api/interviews/${sessionId}`);
    expect(view.turns.some((turn) => turn.content === DEEP_HOOKS)).toBe(true);

    // 用同一个 idempotencyKey 重试：从失败的节点续跑，不会重复写轮次
    const retried = await chat(sessionId, { answer: DEEP_HOOKS, idempotencyKey: 'p3-fault' });
    expect(retried.status).toBe(200);
    expect(streamError(retried.body)).toBeUndefined();
    expect(textOf(retried.body).length).toBeGreaterThan(0);

    const after = await json<{ turns: { content: string }[] }>(`/api/interviews/${sessionId}`);
    expect(after.turns.filter((turn) => turn.content === DEEP_HOOKS)).toHaveLength(1);
  });
});
