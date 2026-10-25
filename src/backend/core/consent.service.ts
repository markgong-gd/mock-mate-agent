/**
 * @file 【后端·core】简历解析同意
 * 未同意时抽取接口直接拒绝。版本来自 schemas，文案一改，旧同意就失效。
 */
import type { RequestCtx } from '@/shared/common/ctx';
import { grantConsent, hasConsent } from '@/backend/db/repos/consents';
import { RESUME_PARSE_CONSENT, type ConsentGrant } from '@/shared/schemas/consent';

export async function getResumeParseConsent(ctx: RequestCtx) {
  const granted = await hasConsent(ctx.userId, RESUME_PARSE_CONSENT.purpose, RESUME_PARSE_CONSENT.version);
  return {
    granted,
    purpose: RESUME_PARSE_CONSENT.purpose,
    version: RESUME_PARSE_CONSENT.version,
    title: RESUME_PARSE_CONSENT.title,
    points: RESUME_PARSE_CONSENT.points,
  };
}

export async function grantResumeParseConsent(ctx: RequestCtx, input: ConsentGrant) {
  await grantConsent(ctx.userId, input.purpose, input.version);
  return { granted: true as const };
}
