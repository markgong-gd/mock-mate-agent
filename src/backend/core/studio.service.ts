/**
 * @file 【后端·core】对话式简历策划
 * 创建只落库。每一轮走 POST chat：先拿 advisory lock，用户的话先写入 studio_turns，再按存档推进图。
 * 简历稿在 coach 节点里落库，所以预览事件发出时库里已经是新稿。退出不删会话，下次 GET 接着聊。
 * 删除要先拿到同一把锁，再去掉会话、轮次和图存档。
 */
import { Command, type BaseCheckpointSaver } from '@langchain/langgraph';
import { createUIMessageStream, type UIMessageChunk } from 'ai';
import { getPool } from '@/backend/db/client';
import { sumSessionTokens } from '@/backend/db/repos/llm-calls';
import {
  findFollowingStudioAssistant,
  findStudioTurnByIdempotency,
  deleteStudioSession,
  getStudioSession,
  insertStudioSession,
  insertStudioUserTurn,
  listStudioSessions,
  listStudioTurns,
  toStudioSummary,
  type StudioSessionRow,
} from '@/backend/db/repos/studio';
import { getCheckpointer } from '@/agent/graphs/checkpointer';
import type { GraphConfigurable } from '@/agent/graphs/config';
import { buildStudioGraph, type StudioGraph } from '@/agent/graphs/studio/graph';
import type { StudioStateType } from '@/agent/graphs/studio/state';
import { graphToUIStream } from '@/agent/graphs/stream';
import type { RequestCtx } from '@/shared/common/ctx';
import { AppError } from '@/shared/common/errors';
import {
  STUDIO_LIMITS,
  studioTraceStepSchema,
  type StudioExport,
  type StudioResumeEvent,
  type StudioSummary,
  type StudioTraceStep,
  type StudioView,
} from '@/shared/schemas/studio';
import { limits } from './config';
import { createUsageHandler } from './usage';

const LOCK_NS = 'mockmate:studio';

let studioGraph: StudioGraph | undefined;

export function getStudioGraph(checkpointer: BaseCheckpointSaver = getCheckpointer()): StudioGraph {
  studioGraph ??= buildStudioGraph(checkpointer);
  return studioGraph;
}

/** 测试注入 MemorySaver 图；传 undefined 恢复默认 */
export function setStudioGraphForTesting(graph: StudioGraph | undefined) {
  studioGraph = graph;
}

const threadConfig = (ctx: RequestCtx, sessionId: string): { configurable: GraphConfigurable } => ({
  configurable: { thread_id: sessionId, userId: ctx.userId, requestId: ctx.requestId },
});

async function acquireStudioLock(
  sessionId: string,
  busyMessage = '这场策划正在生成回复，请稍后再试',
): Promise<() => Promise<void>> {
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
      throw new AppError('CONFLICT', busyMessage);
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

function valuesOf(values: unknown): Partial<StudioStateType> {
  return (values ?? {}) as Partial<StudioStateType>;
}

function tracesOf(values: Partial<StudioStateType>): StudioTraceStep[] {
  if (!Array.isArray(values.traces)) return [];
  return values.traces.flatMap((item) => {
    const parsed = studioTraceStepSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

function liveOf(
  session: StudioSessionRow,
  snap: { next: readonly string[]; values?: unknown },
  started: boolean,
) {
  const values = valuesOf(snap.values);
  const event: StudioResumeEvent = {
    document: started && values.document ? values.document : session.document,
    focus: started && values.focus ? values.focus : session.focus,
    status: started && values.status ? values.status : session.status,
    targetRole: started && values.targetRole !== undefined ? values.targetRole : session.targetRole,
  };
  return {
    ...event,
    started,
    waiting: started && snap.next.includes('wait_user'),
  };
}

async function assertStudioBudget(userId: string, sessionId: string) {
  const used = await sumSessionTokens(userId, sessionId);
  if (used < limits.sessionTokenBudget) return;
  throw new AppError(
    'BUDGET_EXCEEDED',
    `这场策划已用掉 ${used} 个 Token，超过单场上限 ${limits.sessionTokenBudget}。可以导出当前简历，或新开一场。`,
    { details: { used, tokenLimit: limits.sessionTokenBudget } },
  );
}

export async function createStudio(ctx: RequestCtx, input: { title: string }): Promise<StudioSummary> {
  const session = await insertStudioSession({ userId: ctx.userId, title: input.title });
  return toStudioSummary(session);
}

export async function listStudios(ctx: RequestCtx): Promise<{ studios: StudioSummary[] }> {
  return { studios: await listStudioSessions(ctx.userId) };
}

/** 删掉这场策划。对话轮次随会话级联删除，图存档按 thread_id 清掉。生成中先拒绝。 */
export async function deleteStudio(ctx: RequestCtx, sessionId: string): Promise<{ ok: true }> {
  const release = await acquireStudioLock(sessionId, '这场策划正在生成回复，先停下来再删除');
  try {
    const session = await getStudioSession(ctx.userId, sessionId);
    if (!session) throw new AppError('NOT_FOUND', '这场策划不存在');
    const deleted = await deleteStudioSession(ctx.userId, sessionId);
    if (!deleted) throw new AppError('NOT_FOUND', '这场策划不存在');
    await getCheckpointer().deleteThread(sessionId);
    return { ok: true };
  } finally {
    await release();
  }
}

export async function getStudio(ctx: RequestCtx, sessionId: string): Promise<StudioView> {
  const session = await getStudioSession(ctx.userId, sessionId);
  if (!session) throw new AppError('NOT_FOUND', '这场策划不存在');
  const graph = getStudioGraph();
  const snap = await graph.getState(threadConfig(ctx, sessionId));
  const started = Boolean(snap.config?.configurable?.checkpoint_id);
  const live = liveOf(session, snap, started);
  const turns = await listStudioTurns(ctx.userId, sessionId);
  const values = valuesOf(snap.values);
  return {
    id: session.id,
    title: session.title,
    status: live.status,
    targetRole: live.targetRole,
    focus: live.focus,
    document: live.document,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    started: live.started,
    waiting: live.waiting,
    turns: turns.map((turn) => ({
      id: turn.id,
      seq: turn.seq,
      role: turn.role,
      content: turn.content,
    })),
    traces: tracesOf(values),
  };
}

export async function exportStudio(ctx: RequestCtx, sessionId: string): Promise<StudioExport> {
  const session = await getStudioSession(ctx.userId, sessionId);
  if (!session) throw new AppError('NOT_FOUND', '这场策划不存在');
  const graph = getStudioGraph();
  const snap = await graph.getState(threadConfig(ctx, sessionId));
  const started = Boolean(snap.config?.configurable?.checkpoint_id);
  const live = liveOf(session, snap, started);
  return { title: session.title, targetRole: live.targetRole, document: live.document };
}

function replayStream(text: string, event: StudioResumeEvent): ReadableStream<UIMessageChunk> {
  return createUIMessageStream({
    execute({ writer }) {
      writer.write({ type: 'start' });
      writer.write({ type: 'data-studio-resume', data: event, transient: true });
      writer.write({ type: 'text-start', id: 'replay' });
      writer.write({ type: 'text-delta', id: 'replay', delta: text });
      writer.write({ type: 'text-end', id: 'replay' });
      writer.write({ type: 'finish' });
    },
  });
}

export async function streamStudioChat(
  ctx: RequestCtx,
  input: { sessionId: string; message: string; idempotencyKey?: string; signal?: AbortSignal },
): Promise<ReadableStream<UIMessageChunk>> {
  if (input.message.length > STUDIO_LIMITS.messageMaxChars) throw new AppError('VALIDATION', '内容太长');
  const release = await acquireStudioLock(input.sessionId);
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
  input: { sessionId: string; message: string; idempotencyKey?: string; signal?: AbortSignal },
): Promise<ReadableStream<UIMessageChunk>> {
  const session = await getStudioSession(ctx.userId, input.sessionId);
  if (!session) throw new AppError('NOT_FOUND', '这场策划不存在');
  await assertStudioBudget(ctx.userId, session.id);

  const graph = getStudioGraph();
  const cfg = threadConfig(ctx, input.sessionId);
  const snap = await graph.getState(cfg);
  const started = Boolean(snap.config?.configurable?.checkpoint_id);
  const message = input.message.trim();
  let graphInput: Parameters<StudioGraph['stream']>[0];

  if (!started) {
    graphInput = {
      document: session.document,
      targetRole: session.targetRole,
      focus: session.focus,
      status: session.status,
    };
  } else if (message) {
    if (!input.idempotencyKey) throw new AppError('VALIDATION', '缺少 idempotencyKey');
    const existing = await findStudioTurnByIdempotency(ctx.userId, session.id, input.idempotencyKey);
    if (existing) {
      const assistant = await findFollowingStudioAssistant(ctx.userId, session.id, existing.seq);
      const waiting = snap.next.includes('wait_user');
      if (assistant && waiting) {
        return replayStream(assistant.content, liveOf(session, snap, true));
      }
      if (waiting) {
        graphInput = new Command({ resume: { turnId: existing.id, text: existing.content } });
      } else if (snap.next.length > 0) {
        graphInput = null;
      } else {
        throw new AppError('CONFLICT', '这场策划已经结束');
      }
    } else if (snap.next.includes('wait_user')) {
      const turn = await insertStudioUserTurn({
        userId: ctx.userId,
        sessionId: session.id,
        content: message,
        idempotencyKey: input.idempotencyKey,
      });
      graphInput = new Command({ resume: { turnId: turn.id, text: message } });
    } else if (snap.next.length > 0) {
      graphInput = null;
    } else {
      throw new AppError('CONFLICT', '这场策划已经结束');
    }
  } else if (snap.next.includes('wait_user')) {
    throw new AppError('VALIDATION', '请先发送内容');
  } else if (snap.next.length > 0) {
    graphInput = null;
  } else {
    throw new AppError('CONFLICT', '这场策划已经结束');
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
    logContext: { requestId: ctx.requestId, sessionId: session.id, graph: 'studio' },
    prelude: (writer) => {
      writer.write({
        type: 'data-studio-resume',
        data: liveOf(session, snap, started),
        transient: true,
      });
    },
  });
}
