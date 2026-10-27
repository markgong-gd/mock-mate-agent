/**
 * @file 【后端·core】职业档案用例
 * 抽取只返回草稿，不写库。用户在确认页改完，PUT 才整份替换并入队向量化。
 * id 在返回草稿时就分配：确认页来回改字，事实 id 保持不变，已生成的简历引用才不会断。
 * GET 还会带上诊断写回的短板（R-P3）：跨会话累积，按技能去重，前端在档案页展示。
 */
import type { RequestCtx } from '@/shared/common/ctx';
import { AppError } from '@/shared/common/errors';
import { hashUserId, newId } from '@/shared/common/ids';
import { logger } from '@/shared/common/logger';
import { getProfile, saveProfile } from '@/backend/db/repos/profile';
import { listUserWeaknesses } from '@/backend/db/repos/diagnosis';
import { hasConsent } from '@/backend/db/repos/consents';
import { buildProfileExtractGraph, type ProfileExtractGraph } from '@/agent/graphs/extract/graph';
import { redactText } from '@/agent/llm/redact';
import { mergeWeaknesses } from '@/shared/domain/weakness/merge';
import { RESUME_PARSE_CONSENT } from '@/shared/schemas/consent';
import type { ProfileBody, ProfileExtractOutput } from '@/shared/schemas/profile';
import { skillLabel } from '@/shared/schemas/skill-tags';
import type { ProfileWeakness } from '@/shared/schemas/weakness';
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
    skills: draft.skills.map((skill) => ({
      ...skill,
      id: newId(),
      level: 'used' as const,
      evidenceFactIds: [],
    })),
  };
}

/**
 * 档案 = 用户确认的结构化内容 + 诊断写回的短板（R-P3）。
 * 短板按 tag 去重（domain/weakness/merge），所以同一个技能练了几场也只看到一条。
 */
export async function readProfile(ctx: RequestCtx) {
  const [profile, rows] = await Promise.all([getProfile(ctx.userId), listUserWeaknesses(ctx.userId)]);
  const weaknesses: ProfileWeakness[] = mergeWeaknesses({ existing: rows }).profile.map((item) => ({
    tag: item.tag,
    label: skillLabel(item.tag),
    title: item.title,
    detail: item.detail,
    severity: item.severity,
    status: item.status,
    occurrences: item.occurrences,
    firstSeenAt: new Date(item.firstSeenAt).toISOString(),
    lastSeenAt: new Date(item.lastSeenAt).toISOString(),
    reportId: item.reportId,
    sessionId: item.sessionId,
    evidenceQuote: item.evidenceQuote,
  }));
  return { profile, weaknesses };
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
    {
      requestId: ctx.requestId,
      userIdHash: hashUserId(ctx.userId),
      chars: text.length,
      redacted: redacted.counts,
    },
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
