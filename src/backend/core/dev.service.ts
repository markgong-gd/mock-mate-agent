/**
 * @file 【后端·core】回声图用例（后端 ↔ 智能体的衔接样板）
 * 做什么：streamEchoTurn —— 读存档判断模式（start / resume / continue），调用图并转换为 UI Message Stream；
 *        getEchoThread —— 从存档重建对话；getThreadState / getGraphMermaid —— 调试用。
 * 要点：身份通过 config.configurable 注入图；用量回调由 createUsageHandler 挂载。未来 interview.service 照此实现。
 */
import type { BaseMessage } from '@langchain/core/messages';
import { Command } from '@langchain/langgraph';
import type { UIMessage, UIMessageChunk } from 'ai';
import { getCheckpointer } from '@/agent/graphs/checkpointer';
import type { GraphConfigurable } from '@/agent/graphs/config';
import { buildEchoGraph, type EchoGraph } from '@/agent/graphs/echo/graph';
import { buildInterviewGraph } from '@/agent/graphs/interview/graph';
import type { EchoStateType } from '@/agent/graphs/echo/state';
import { graphToUIStream } from '@/agent/graphs/stream';
import { injectFakeFaults } from '@/agent/llm/fake';
import type { RequestCtx } from '@/shared/common/ctx';
import { AppError } from '@/shared/common/errors';
import { createUsageHandler } from './usage';

let echoGraph: EchoGraph | undefined;

const getEchoGraph = (): EchoGraph => (echoGraph ??= buildEchoGraph(getCheckpointer()));

/** 测试用：注入使用 MemorySaver 等的图；传 undefined 恢复默认 */
export function setEchoGraphForTesting(g: EchoGraph | undefined) {
  echoGraph = g;
}

const GRAPHS = {
  echo: getEchoGraph,
  interview: () => buildInterviewGraph(getCheckpointer()),
} as const;
export type DevGraphName = keyof typeof GRAPHS;
export const DEV_GRAPH_NAMES = Object.keys(GRAPHS) as DevGraphName[];

const threadConfig = (ctx: RequestCtx, threadId: string): { configurable: GraphConfigurable } => ({
  configurable: { thread_id: threadId, userId: ctx.userId, requestId: ctx.requestId },
});

const textOf = (m: BaseMessage): string =>
  typeof m.content === 'string'
    ? m.content
    : m.content
        .map((p) => (typeof p === 'object' && 'text' in p && typeof p.text === 'string' ? p.text : ''))
        .join('');

function toUIMessages(messages: BaseMessage[]): UIMessage[] {
  return messages
    .filter((m) => m.getType() === 'human' || m.getType() === 'ai')
    .map((m, i) => ({
      id: m.id ?? `msg-${i}`,
      role: m.getType() === 'human' ? ('user' as const) : ('assistant' as const),
      parts: [{ type: 'text' as const, text: textOf(m) }],
    }));
}

export interface EchoThreadView {
  threadId: string;
  exists: boolean;
  /** 下一步要执行的节点；['wait_answer'] 表示正在等待回答 */
  next: string[];
  round: number;
  maxRounds: number;
  status: 'running' | 'finished';
  messages: UIMessage[];
}

/** 恢复视图：刷新页面 / 进程重启后从存档重建对话 */
export async function getEchoThread(ctx: RequestCtx, threadId: string): Promise<EchoThreadView> {
  const snap = await getEchoGraph().getState(threadConfig(ctx, threadId));
  const values = (snap.values ?? {}) as Partial<EchoStateType>;
  return {
    threadId,
    exists: Boolean(snap.config?.configurable?.checkpoint_id),
    next: [...snap.next],
    round: values.round ?? 0,
    maxRounds: values.maxRounds ?? 0,
    status: values.status ?? 'running',
    messages: toUIMessages(values.messages ?? []),
  };
}

/**
 * 推进回声图一轮，返回 UI Message Stream：
 * - 无存档：从头开始（ask → wait_answer 中断）
 * - 停在 wait_answer：Command({ resume: answer })
 * - 停在其它节点（上次中途失败）：stream(null) 从失败节点续跑
 */
export async function streamEchoTurn(
  ctx: RequestCtx,
  input: { threadId: string; answer: string; signal?: AbortSignal },
): Promise<ReadableStream<UIMessageChunk>> {
  const startedAt = Date.now();
  const graph = getEchoGraph();
  const cfg = threadConfig(ctx, input.threadId);
  const snap = await graph.getState(cfg);
  const started = Boolean(snap.config?.configurable?.checkpoint_id);

  let graphInput: Parameters<EchoGraph['stream']>[0];
  let mode: 'start' | 'resume' | 'continue';
  if (!started) {
    graphInput = {};
    mode = 'start';
  } else if (snap.next.includes('wait_answer')) {
    graphInput = new Command({ resume: input.answer });
    mode = 'resume';
  } else if (snap.next.length > 0) {
    graphInput = null;
    mode = 'continue';
  } else {
    throw new AppError('CONFLICT', '本场对话已结束，请新建会话');
  }

  const stream = await graph.stream(graphInput, {
    ...cfg,
    streamMode: ['values', 'messages', 'custom'],
    callbacks: [
      createUsageHandler({ userId: ctx.userId, requestId: ctx.requestId, sessionId: input.threadId }),
    ],
    signal: input.signal,
  });

  return graphToUIStream<EchoStateType>(stream, {
    startedAt,
    logContext: { requestId: ctx.requestId, threadId: input.threadId, graph: 'echo', mode },
    prelude: (writer) => writer.write({ type: 'data-run', data: { mode }, transient: true }),
  });
}

export interface ThreadStateView {
  threadId: string;
  checkpointId?: string;
  createdAt?: string;
  next: string[];
  interrupts: unknown[];
  values: Record<string, unknown>;
  history: Array<{
    checkpointId?: string;
    step?: number;
    source?: string;
    next: string[];
    createdAt?: string;
  }>;
}

const summarizeValues = (values: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(values).map(([k, v]) =>
      k === 'messages' && Array.isArray(v)
        ? [
            k,
            (v as BaseMessage[]).map((m) => ({
              type: m.getType(),
              id: m.id,
              preview: textOf(m).slice(0, 80),
            })),
          ]
        : [k, v],
    ),
  );

/** 调试：getState + getStateHistory 摘要（仅开发环境开放） */
export async function getThreadState(
  ctx: RequestCtx,
  graphName: DevGraphName,
  threadId: string,
  historyLimit = 20,
): Promise<ThreadStateView> {
  const graph = GRAPHS[graphName]();
  const cfg = threadConfig(ctx, threadId);
  const snap = await graph.getState(cfg);
  const history: ThreadStateView['history'] = [];
  for await (const s of graph.getStateHistory(cfg, { limit: historyLimit })) {
    history.push({
      checkpointId: s.config.configurable?.checkpoint_id as string | undefined,
      step: s.metadata?.step,
      source: s.metadata?.source,
      next: [...s.next],
      createdAt: s.createdAt,
    });
  }
  return {
    threadId,
    checkpointId: snap.config?.configurable?.checkpoint_id as string | undefined,
    createdAt: snap.createdAt,
    next: [...snap.next],
    interrupts: snap.tasks.flatMap((t) => t.interrupts.map((i) => i.value)),
    values: summarizeValues((snap.values ?? {}) as Record<string, unknown>),
    history,
  };
}

/** 调试：输出图结构的 Mermaid 文本 */
export async function getGraphMermaid(graphName: DevGraphName): Promise<string> {
  const g = await GRAPHS[graphName]().getGraphAsync();
  return g.drawMermaid();
}

/**
 * 故障注入（P3-09，仅开发路由）：让接下来 n 次假模型调用抛错。
 * 用来手工验收"模型失败时页面有提示、已提交的回答不丢、点重试能从断点续跑"。
 * 只对 kind = fake 的 provider 生效；接了真实模型时注入不会有任何效果。
 */
export function injectLlmFailures(n: number): { pendingFailures: number; fakeOnly: true } {
  return { pendingFailures: injectFakeFaults(n), fakeOnly: true };
}
