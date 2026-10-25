/**
 * @file 【后端·core】定制简历用例
 * 生成走简历图，HTTP 把 custom 流里的 JSON 片段原样交给 useObject。
 * 导出前再跑一次 guard：事实被删掉之后，当时标过 verified 的描述也不能导出。
 */
import type { RequestCtx } from '@/shared/common/ctx';
import { AppError } from '@/shared/common/errors';
import { getProfile, listFactSnippets } from '@/backend/db/repos/profile';
import { getResume, insertResumeVersion, listResumes, updateResumeContent } from '@/backend/db/repos/resumes';
import {
  buildResumeGraph,
  isResumeDelta,
  RESUME_PROMPT_VERSION,
  type ResumeGraph,
} from '@/agent/graphs/resume/graph';
import { factRefGuard, hasUnverified } from '@/shared/domain/resume/fact-ref-guard';
import type { ResumeContent, ResumeEditInput } from '@/shared/schemas/resume';
import { createUsageHandler } from './usage';

let graph: ResumeGraph | undefined;
const getGraph = () => (graph ??= buildResumeGraph());

export function setResumeGraphForTesting(next: ResumeGraph | undefined) {
  graph = next;
}

async function allowedFactIds(userId: string) {
  return (await listFactSnippets(userId)).map((fact) => fact.id);
}

function refuseIfUnverified(content: ResumeContent, factIds: readonly string[]) {
  const guarded = factRefGuard(content, factIds);
  if (hasUnverified(content) || guarded.unverifiedCount > 0) {
    throw new AppError('CONFLICT', '简历含有未溯源的描述，不能导出', {
      details: { unverified: Math.max(guarded.unverifiedCount, hasUnverified(content) ? 1 : 0) },
    });
  }
}

export async function listResumeViews(ctx: RequestCtx, jobId?: string) {
  return { resumes: await listResumes(ctx.userId, jobId) };
}

export async function readResume(ctx: RequestCtx, resumeId: string) {
  const resume = await getResume(ctx.userId, resumeId);
  if (!resume) throw new AppError('NOT_FOUND', '简历不存在');
  return { resume };
}

export async function streamResume(ctx: RequestCtx, jobId: string, signal?: AbortSignal) {
  const encoder = new TextEncoder();
  const iterable = await getGraph().stream(
    { jobId },
    {
      configurable: { thread_id: `resume:${ctx.requestId}`, userId: ctx.userId, requestId: ctx.requestId },
      streamMode: 'custom',
      signal,
      callbacks: [createUsageHandler({ userId: ctx.userId, requestId: ctx.requestId, sessionId: jobId })],
      metadata: { functionId: 'resume.generate', promptVersion: RESUME_PROMPT_VERSION },
    },
  );
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of iterable) {
          if (isResumeDelta(chunk)) controller.enqueue(encoder.encode(chunk.text));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

/** 编辑后的正文以服务端 guard 为准。asNewVersion 为真时另存一版，否则覆盖当前版。 */
export async function editResume(ctx: RequestCtx, resumeId: string, input: ResumeEditInput) {
  const current = await getResume(ctx.userId, resumeId);
  if (!current) throw new AppError('NOT_FOUND', '简历不存在');
  const { content } = factRefGuard(
    { headline: input.headline, summary: input.summary, sections: input.sections },
    await allowedFactIds(ctx.userId),
  );
  if (input.asNewVersion) {
    return { resume: await insertResumeVersion(ctx.userId, current.jobId, content) };
  }
  const resume = await updateResumeContent(ctx.userId, resumeId, content);
  if (!resume) throw new AppError('NOT_FOUND', '简历不存在');
  return { resume };
}

export async function exportResume(ctx: RequestCtx, resumeId: string) {
  const resume = await getResume(ctx.userId, resumeId);
  if (!resume) throw new AppError('NOT_FOUND', '简历不存在');
  const factIds = await allowedFactIds(ctx.userId);
  refuseIfUnverified(resume.content, factIds);
  const profile = await getProfile(ctx.userId);
  return {
    resume,
    contact: profile?.contact ?? { name: '', phone: '', email: '' },
  };
}
