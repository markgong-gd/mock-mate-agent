/**
 * @file 【后端·core】C3 诊断
 * 面试结束后建一份 pending 报告（unique(session_id, rubric_version) 幂等），再入队 diagnose，页面不等模型。
 * run() 跑诊断图，thread = diag:<reportId>：pg-boss 重试或手动重试时都从断点续跑，已经打好的分不重算。
 * 报告状态只在这里改：图只负责算和写业务表，失败分类交给调用方（队列重试 / 手动重试）。
 */
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { getCheckpointer } from '@/agent/graphs/checkpointer';
import type { GraphConfigurable } from '@/agent/graphs/config';
import { buildDiagnosisGraph, type DiagnosisGraph } from '@/agent/graphs/diagnosis/graph';
import {
  ensureReport,
  findReportBySession,
  getActiveRubric,
  getReport,
  getRubric,
  listReports,
  listWeaknessesByReport,
  setReportStatus,
  type ReportRow,
} from '@/backend/db/repos/diagnosis';
import { getInterviewSession, listInterviewTurns } from '@/backend/db/repos/interviews';
import type { RequestCtx } from '@/shared/common/ctx';
import { AppError } from '@/shared/common/errors';
import { logger } from '@/shared/common/logger';
import type { DiagnosisReportSummary, DiagnosisReportView } from '@/shared/schemas/diagnosis';
import { skillLabel } from '@/shared/schemas/skill-tags';
import { createUsageHandler } from './usage';

export interface DiagnoseRequest {
  userId: string;
  reportId: string;
}

let diagnosisGraph: DiagnosisGraph | undefined;
let sender: ((input: DiagnoseRequest) => Promise<void>) | undefined;

export function getDiagnosisGraph(checkpointer: BaseCheckpointSaver = getCheckpointer()): DiagnosisGraph {
  diagnosisGraph ??= buildDiagnosisGraph(checkpointer);
  return diagnosisGraph;
}

/** 测试注入 MemorySaver 图；传 undefined 恢复默认 */
export function setDiagnosisGraphForTesting(graph: DiagnosisGraph | undefined) {
  diagnosisGraph = graph;
}

/** runtime 启动 pg-boss 后注入。没注入时（例如集成测试）就在当前进程跑完 */
export function setDiagnoseSender(next: (input: DiagnoseRequest) => Promise<void>) {
  sender = next;
}

const threadConfig = (input: {
  userId: string;
  requestId: string;
  reportId: string;
}): { configurable: GraphConfigurable } => ({
  configurable: {
    thread_id: `diag:${input.reportId}`,
    userId: input.userId,
    requestId: input.requestId,
  },
});

/** 新报告一律用当前上线的 Rubric；没有就是没跑过 seed，属于配置问题，直接报错 */
async function activeRubricVersion(): Promise<string> {
  const rubric = await getActiveRubric();
  if (!rubric) throw new AppError('VALIDATION', '还没有导入评分标准，先运行 pnpm db:seed');
  return rubric.version;
}

/**
 * 面试结束时调用：建档 + 入队。
 * 已经有报告时不重复入队（除非上次是 failed），所以 finish 和流式结束各调一次也安全。
 */
export async function requestDiagnosis(
  ctx: RequestCtx,
  sessionId: string,
): Promise<{ reportId: string; queued: boolean }> {
  const session = await getInterviewSession(ctx.userId, sessionId);
  if (!session) throw new AppError('NOT_FOUND', '这场面试不存在');
  const rubricVersion = await activeRubricVersion();
  const report = await ensureReport({ userId: ctx.userId, sessionId, rubricVersion });
  const queued = report.created || report.status === 'failed';
  if (!queued) return { reportId: report.id, queued: false };
  if (report.status === 'failed') await setReportStatus(ctx.userId, report.id, 'pending');
  await enqueue({ userId: ctx.userId, reportId: report.id }, ctx.requestId);
  return { reportId: report.id, queued: true };
}

async function enqueue(input: DiagnoseRequest, requestId: string) {
  if (sender) {
    await sender(input);
    return;
  }
  try {
    await runDiagnosis(input, requestId);
  } catch {
    // 没有队列时就地跑：失败已经记成 failed，页面按状态提示并可手动重试，不要牵连调用方的请求
  }
}

/** 队列 handler 的入口。失败时记 failed 并抛出，交给 pg-boss 重试 */
export async function runDiagnosis(input: DiagnoseRequest, requestId = `diag-${input.reportId}`) {
  const report = await getReport(input.userId, input.reportId);
  if (!report) throw new AppError('NOT_FOUND', '诊断报告不存在');
  if (report.status === 'done') return;
  await setReportStatus(input.userId, input.reportId, 'running');
  try {
    const graph = getDiagnosisGraph();
    const cfg = threadConfig({ ...input, requestId });
    const snap = await graph.getState(cfg);
    // 停在某个节点上就从断点续跑（不重新 load、不重复打分）；跑完过或没跑过都从头开始
    const resume = Boolean(snap.config?.configurable?.checkpoint_id) && snap.next.length > 0;
    await graph.invoke(resume ? null : { reportId: input.reportId }, {
      ...cfg,
      // 用量挂到面试的 sessionId（不是 diag: 线程 id），这样"单场成本"包含诊断（N-12）
      callbacks: [createUsageHandler({ userId: input.userId, requestId, sessionId: report.sessionId })],
    });
    logger.info({ reportId: input.reportId, requestId }, 'diagnosis done');
  } catch (error) {
    const message = error instanceof Error ? error.message : '诊断失败';
    await setReportStatus(input.userId, input.reportId, 'failed', message.slice(0, 500));
    logger.error({ err: error, reportId: input.reportId, requestId }, 'diagnosis failed');
    throw error;
  }
}

function toSummary(row: ReportRow): DiagnosisReportSummary {
  return {
    id: row.id,
    sessionId: row.sessionId,
    jobId: row.jobId,
    jobTitle: row.jobTitle,
    rubricVersion: row.rubricVersion,
    status: row.status,
    overall: row.overall,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getReportView(ctx: RequestCtx, reportId: string): Promise<DiagnosisReportView> {
  const report = await getReport(ctx.userId, reportId);
  if (!report) throw new AppError('NOT_FOUND', '诊断报告不存在');
  const [rubric, weaknessRows, turns] = await Promise.all([
    getRubric(report.rubricVersion),
    listWeaknessesByReport(ctx.userId, reportId),
    listInterviewTurns(ctx.userId, report.sessionId),
  ]);
  return {
    ...toSummary(report),
    updatedAt: report.updatedAt.toISOString(),
    error: report.error,
    rubric: rubric?.definition ?? null,
    scores: report.scores,
    plan: report.plan,
    weaknesses: weaknessRows.map((row) => ({ ...row, label: skillLabel(row.tag) })),
    turns: turns.map((turn) => ({
      id: turn.id,
      seq: turn.seq,
      role: turn.role,
      content: turn.content,
      questionId: turn.questionId,
      isFollowUp: turn.isFollowUp,
    })),
  };
}

export async function listReportSummaries(
  ctx: RequestCtx,
  query: { sessionId?: string } = {},
): Promise<{ reports: DiagnosisReportSummary[] }> {
  if (query.sessionId) {
    const report = await findReportBySession(ctx.userId, query.sessionId);
    return { reports: report ? [toSummary(report)] : [] };
  }
  const rows = await listReports(ctx.userId);
  return { reports: rows.map(toSummary) };
}

/** 最终失败后手动重试：状态回到 pending 再入队，存档还在所以不会从头跑 */
export async function retryReport(ctx: RequestCtx, reportId: string): Promise<DiagnosisReportView> {
  const report = await getReport(ctx.userId, reportId);
  if (!report) throw new AppError('NOT_FOUND', '诊断报告不存在');
  if (report.status === 'done') throw new AppError('CONFLICT', '这份报告已经生成好了');
  if (report.status === 'running') throw new AppError('CONFLICT', '这份报告正在生成，请稍后刷新');
  await setReportStatus(ctx.userId, reportId, 'pending');
  await enqueue({ userId: ctx.userId, reportId }, ctx.requestId);
  return getReportView(ctx, reportId);
}
