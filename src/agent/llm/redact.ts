/**
 * @file 【智能体·llm】发送给模型前的 PII 脱敏
 * 做什么：把手机号、邮箱、18 位证件号替换成占位符。规则本体在 shared/common/pii.ts。
 * 为什么在这里再包一层：模型入口统一用这个名字（redactText 返回 counts 便于写日志时只记次数）；
 *   日志出口在 shared/common/logger.ts，两条路径共用同一套规则（N-3、03 P3-07）。
 * 覆盖面：extract / interview（ask、evaluate）/ diagnosis（score、weakness）/ resume（事实与 JD 文本）/ 日志。
 */
import { redactPii, type PiiHits, type RedactedText } from '@/shared/common/pii';

export { redactPii };
export type { PiiHits, RedactedText };

/** 图与用例里使用的名字。counts 只记命中次数，不记原文 */
export function redactText(input: string) {
  const { text, hits } = redactPii(input);
  return { text, counts: hits };
}
