/**
 * @file 【后端·core】职业档案用例
 * 抽取只返回草稿，不写库。用户在确认页改完，PUT 才整份替换并入队向量化。
 * id 在返回草稿时就分配：确认页来回改字，事实 id 保持不变，已生成的简历引用才不会断。
 */
import type { RequestCtx } from '@/shared/common/ctx';
import { AppError } from '@/shared/common/errors';
import { hashUserId, newId } from '@/shared/common/ids';
import { logger } from '@/shared/common/logger';
import { getProfile, saveProfile } from '@/backend/db/repos/profile';
import { hasConsent } from '@/backend/db/repos/consents';
import { buildProfileExtractGraph, type ProfileExtractGraph } from '@/agent/graphs/extract/graph';
import { redactText } from '@/agent/llm/redact';
import { RESUME_PARSE_CONSENT } from '@/shared/schemas/consent';
import type { ProfileBody, ProfileExtractOutput } from '@/shared/schemas/profile';
import { createUsageHandler } from './usage';
import { requestEmbedFacts } from './embed.service';

let graph: ProfileExtractGraph | undefined;
const getGraph = () => (graph ??= buildProfileExtractGraph());

/** 测试可注入一张不调模型的图 */
export function setProfileExtractGraphForTesting(next: ProfileExtractGraph | undefined) {
  graph = next;
}

export type ProfileDraft = Omit<ProfileBody, 'contact'>;

function materialize(draft: ProfileExtractOutput): ProfileDraft {
  return {
    headline: draft.headline,
    summary: draft.summary,
    experiences: draft.experiences.map((exp) => ({
      ...exp,
      id: newId(),
      facts: exp.facts.map((fact) => ({ ...fact, id: newId() })),
    })),
    skills: draft.skills.map((skill) => ({ ...skill, id: newId() })),
  };
}

export async function readProfile(ctx: RequestCtx) {
  return { profile: await getProfile(ctx.userId) };
}

/** 脱敏 → 抽取图 → 补 id。不落库。 */
export async function extractProfile(ctx: RequestCtx, text: string) {
  const agreed = await hasConsent(ctx.userId, RESUME_PARSE_CONSENT.purpose, RESUME_PARSE_CONSENT.version);
  if (!agreed) throw new AppError('FORBIDDEN', '请先同意简历解析用途');
  const redacted = redactText(text);
  const result = await getGraph().invoke(
    { text },
    {
      configurable: { thread_id: `profile:${ctx.requestId}`, userId: ctx.userId, requestId: ctx.requestId },
      callbacks: [createUsageHandler({ userId: ctx.userId, requestId: ctx.requestId })],
    },
  );
  if (!result.draft) throw new AppError('LLM_SCHEMA_INVALID');
  logger.info(
    { requestId: ctx.requestId, userIdHash: hashUserId(ctx.userId), chars: text.length, redacted: redacted.counts },
    'profile extracted',
  );
  return { draft: materialize(result.draft), redacted: redacted.counts };
}

/** 用户确认后的整份档案。保存成功后异步向量化，失败不影响这次保存。 */
export async function confirmProfile(ctx: RequestCtx, body: ProfileBody) {
  const profile = await saveProfile(ctx.userId, body);
  try {
    await requestEmbedFacts(ctx.userId);
  } catch (err) {
    logger.error({ err, userIdHash: hashUserId(ctx.userId) }, 'enqueue embed-facts failed');
  }
  return { profile };
}
