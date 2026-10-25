/**
 * @file 【后端·core】文字面试
 * 创建会话只落库。第一题和之后的每一轮都走 POST chat：
 * 先拿 advisory lock，回答先写入 interview_turns，再按存档 next 决定 resume 或从失败节点续跑。
 * 同一把锁会盖住整个流，所以并发的第二请求直接 409，而不是排队等模型。
 */
import { Command, type BaseCheckpointSaver } from '@langchain/langgraph';
import { createUIMessageStream, type UIMessageChunk } from 'ai';
import { getPool } from '@/backend/db/client';
import { getJob } from '@/backend/db/repos/jobs';
import {
  findFollowingAssistant,
  findTurnByIdempotency,
  getInterviewSession,
  insertInterviewSession,
  insertUserTurn,
  listInterviewSessions,
  listInterviewTurns,
  setInterviewStatus,
  toSummary,
  type SessionRow,
  type TurnRow,
} from '@/backend/db/repos/interviews';
import { getCheckpointer } from '@/agent/graphs/checkpointer';
import type { GraphConfigurable } from '@/agent/graphs/config';
import { buildInterviewGraph, type InterviewGraph } from '@/agent/graphs/interview/graph';
import type { InterviewStateType } from '@/agent/graphs/interview/state';
import { graphToUIStream } from '@/agent/graphs/stream';
import type { RequestCtx } from '@/shared/common/ctx';
import { AppError } from '@/shared/common/errors';
import { newId } from '@/shared/common/ids';
import {
  INTERVIEW_LIMITS,
  type InterviewProgress,
  type InterviewSettings,
  type InterviewSummary,
  type InterviewView,
} from '@/shared/schemas/interview';
import { createUsageHandler } from './usage';

const LOCK_NS = 'mockmate:interview';

let interviewGraph: InterviewGraph | undefined;

export function getInterviewGraph(checkpointer: BaseCheckpointSaver = getCheckpointer()): InterviewGraph {
  interviewGraph ??= buildInterviewGraph(checkpointer);
  return interviewGraph;
}

/** 测试注入 MemorySaver 图；传 undefined 恢复默认 */
export function setInterviewGraphForTesting(graph: InterviewGraph | undefined) {
  interviewGraph = graph;
}

const threadConfig = (ctx: RequestCtx, sessionId: string): { configurable: GraphConfigurable } => ({
  configurable: { thread_id: sessionId, userId: ctx.userId, requestId: ctx.requestId },
});

async function acquireInterviewLock(sessionId: string): Promise<() => Promise<void>> {
  const client = await getPool().connect();
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    try {
      await client.query('select pg_advisory_unlock(hashtext($1), hashtext($2))', [LOCK_NS, sessionId]);
    } finally {
      client.release();
    }
  };
  try {
    const locked = await client.query<{ locked: boolean }>(
      'select pg_try_advisory_lock(hashtext($1), hashtext($2)) as locked',
      [LOCK_NS, sessionId],
    );
    if (!locked.rows[0]?.locked) {
      await release();
      throw new AppError('CONFLICT', '这场面试正在生成回复，请稍后再试');
    }
    return release;
  } catch (error) {
    await release();
    throw error;
  }
}

function releaseWhenDone(stream: ReadableStream<UIMessageChunk>, release: () => Promise<void>) {
  let released = false;
  const once = () => {
    if (released) return;
    released = true;
    void release();
  };
  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      const reader = stream.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        once();
        reader.releaseLock();
      }
    },
    cancel() {
      once();
    },
  });
}

async function drain(stream: AsyncIterable<unknown>) {
  for await (const _chunk of stream) {
    /* 结束面试时不把 token 回给按钮，只要图跑完 */
  }
}

function valuesOf(values: unknown): Partial<InterviewStateType> {
  return (values ?? {}) as Partial<InterviewStateType>;
}

function progressOf(
  session: SessionRow,
  snap: { next: readonly string[]; values?: unknown },
  started: boolean,
): InterviewProgress {
  const values = valuesOf(snap.values);
  const queue = values.questionQueue ?? [];
  const cursor = values.cursor ?? 0;
  const finished = session.status === 'finished' || values.status === 'finished';
  let phase: InterviewProgress['phase'] = 'planning';
  if (finished) phase = 'finished';
  else if (snap.next.includes('wait_answer')) phase = 'waiting';
  else if (snap.next.includes('evaluate')) phase = 'evaluating';
  else if (started) phase = 'asking';
  return {
    cursor,
    total: queue.length > 0 ? queue.length : session.settings.questionCount,
    followUpCount: values.followUpCount ?? 0,
    maxFollowUps: values.maxFollowUps ?? session.settings.maxFollowUps,
    phase,
    questionId: queue[cursor]?.id ?? null,
    status: finished ? 'finished' : 'running',
  };
}

function turnView(turn: TurnRow) {
  return {
    id: turn.id,
    seq: turn.seq,
    role: turn.role,
    content: turn.content,
    questionId: turn.questionId,
    isFollowUp: turn.isFollowUp,
  };
}

export async function createInterview(
  ctx: RequestCtx,
  input: { jobId: string; settings: InterviewSettings },
): Promise<InterviewSummary> {
  const job = await getJob(ctx.userId, input.jobId);
  if (!job) throw new AppError('NOT_FOUND', '目标岗位不存在');
  const session = await insertInterviewSession({
    userId: ctx.userId,
    jobId: input.jobId,
    settings: input.settings,
  });
  return toSummary(session);
}

export async function listInterviews(ctx: RequestCtx): Promise<{ interviews: InterviewSummary[] }> {
  return { interviews: await listInterviewSessions(ctx.userId) };
}

export async function getInterview(ctx: RequestCtx, sessionId: string): Promise<InterviewView> {
  const session = await getInterviewSession(ctx.userId, sessionId);
  if (!session) throw new AppError('NOT_FOUND', '这场面试不存在');
  const graph = getInterviewGraph();
  const snap = await graph.getState(threadConfig(ctx, sessionId));
  const started = Boolean(snap.config?.configurable?.checkpoint_id);
  const turns = await listInterviewTurns(ctx.userId, sessionId);
  return {
    id: session.id,
    jobId: session.jobTargetId,
    jobTitle: session.jobTitle,
    mode: session.mode,
    kind: session.kind,
    settings: session.settings,
    status: session.status,
    createdAt: session.createdAt.toISOString(),
    progress: progressOf(session, snap, started),
    next: [...snap.next],
    turns: turns.map(turnView),
  };
}

function replayStream(text: string, progress: InterviewProgress): ReadableStream<UIMessageChunk> {
  return createUIMessageStream({
    execute({ writer }) {
      writer.write({ type: 'start' });
      writer.write({ type: 'data-interview-state', data: progress, transient: true });
      writer.write({ type: 'text-start', id: 'replay' });
      writer.write({ type: 'text-delta', id: 'replay', delta: text });
      writer.write({ type: 'text-end', id: 'replay' });
      writer.write({ type: 'finish' });
    },
  });
}

export async function streamInterviewChat(
  ctx: RequestCtx,
  input: { sessionId: string; answer: string; idempotencyKey?: string; signal?: AbortSignal },
): Promise<ReadableStream<UIMessageChunk>> {
  if (input.answer.length > INTERVIEW_LIMITS.answerMaxChars) throw new AppError('VALIDATION', '回答太长');
  const release = await acquireInterviewLock(input.sessionId);
  try {
    const stream = await openChatStream(ctx, input);
    return releaseWhenDone(stream, release);
  } catch (error) {
    await release();
    throw error;
  }
}

async function openChatStream(
  ctx: RequestCtx,
  input: { sessionId: string; answer: string; idempotencyKey?: string; signal?: AbortSignal },
): Promise<ReadableStream<UIMessageChunk>> {
  const session = await getInterviewSession(ctx.userId, input.sessionId);
  if (!session) throw new AppError('NOT_FOUND', '这场面试不存在');
  if (session.status === 'finished') throw new AppError('CONFLICT', '这场面试已经结束');

  const graph = getInterviewGraph();
  const cfg = threadConfig(ctx, input.sessionId);
  const snap = await graph.getState(cfg);
  const started = Boolean(snap.config?.configurable?.checkpoint_id);
  const values = valuesOf(snap.values);
  const answer = input.answer.trim();
  let graphInput: Parameters<InterviewGraph['stream']>[0];

  if (!started) {
    if (session.status === 'pending') await setInterviewStatus(ctx.userId, session.id, 'running');
    graphInput = {
      jobId: session.jobTargetId,
      settings: session.settings,
      maxFollowUps: session.settings.maxFollowUps,
    };
  } else if (answer) {
    if (!input.idempotencyKey) throw new AppError('VALIDATION', '缺少 idempotencyKey');
    const existing = await findTurnByIdempotency(ctx.userId, session.id, input.idempotencyKey);
    if (existing) {
      const assistant = await findFollowingAssistant(ctx.userId, session.id, existing.seq);
      const waitingForNext = snap.next.includes('wait_answer') || snap.next.length === 0;
      if (assistant && waitingForNext) {
        return replayStream(assistant.content, progressOf(session, snap, true));
      }
      if (snap.next.includes('wait_answer')) {
        graphInput = new Command({
          resume: { turnId: existing.id, text: existing.content },
        });
      } else if (snap.next.length > 0) {
        graphInput = null;
      } else {
        throw new AppError('CONFLICT', '这场面试已经结束');
      }
    } else if (snap.next.includes('wait_answer')) {
      const queue = values.questionQueue ?? [];
      const cursor = values.cursor ?? 0;
      const turn = await insertUserTurn({
        userId: ctx.userId,
        sessionId: session.id,
        content: answer,
        questionId: queue[cursor]?.id ?? null,
        idempotencyKey: input.idempotencyKey,
        isFollowUp: (values.followUpCount ?? 0) > 0,
      });
      graphInput = new Command({ resume: { turnId: turn.id, text: answer } });
    } else if (snap.next.length > 0) {
      graphInput = null;
    } else {
      throw new AppError('CONFLICT', '这场面试已经结束');
    }
  } else if (snap.next.includes('wait_answer')) {
    throw new AppError('VALIDATION', '请先提交回答');
  } else if (snap.next.length > 0) {
    graphInput = null;
  } else {
    throw new AppError('CONFLICT', '这场面试已经结束');
  }

  const startedAt = Date.now();
  const stream = await graph.stream(graphInput, {
    ...cfg,
    streamMode: ['values', 'messages', 'custom'],
    callbacks: [createUsageHandler({ userId: ctx.userId, requestId: ctx.requestId, sessionId: session.id })],
    signal: input.signal,
  });
  return graphToUIStream(stream, {
    startedAt,
    logContext: { requestId: ctx.requestId, sessionId: session.id, graph: 'interview' },
    prelude: (writer) => {
      writer.write({
        type: 'data-interview-state',
        data: progressOf({ ...session, status: 'running' }, snap, started),
        transient: true,
      });
    },
  });
}

export async function finishInterview(ctx: RequestCtx, sessionId: string): Promise<InterviewView> {
  const release = await acquireInterviewLock(sessionId);
  try {
    const session = await getInterviewSession(ctx.userId, sessionId);
    if (!session) throw new AppError('NOT_FOUND', '这场面试不存在');
    if (session.status !== 'finished') {
      const graph = getInterviewGraph();
      const cfg = threadConfig(ctx, sessionId);
      const snap = await graph.getState(cfg);
      const started = Boolean(snap.config?.configurable?.checkpoint_id);
      const runConfig = {
        ...cfg,
        streamMode: 'updates' as const,
        callbacks: [createUsageHandler({ userId: ctx.userId, requestId: ctx.requestId, sessionId })],
      };
      if (!started) {
        await setInterviewStatus(ctx.userId, sessionId, 'finished');
      } else if (snap.next.includes('wait_answer')) {
        await drain(
          await graph.stream(new Command({ resume: { turnId: newId(), text: '', abort: true } }), runConfig),
        );
      } else if (snap.next.includes('evaluate')) {
        await graph.updateState(cfg, { aborted: true });
        await drain(await graph.stream(null, runConfig));
      } else if (snap.next.length > 0) {
        await graph.updateState(
          cfg,
          { aborted: true, lastEval: { depth: 1, needFollowUp: false, reason: '用户结束了这场面试' } },
          'evaluate',
        );
        await drain(await graph.stream(null, runConfig));
      } else {
        await setInterviewStatus(ctx.userId, sessionId, 'finished');
      }
    }
    return await getInterview(ctx, sessionId);
  } finally {
    await release();
  }
}
