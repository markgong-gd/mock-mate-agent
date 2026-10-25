/**
 * @file 【后端·core】进模型前的文本
 * 做什么：限制长度，并脱敏手机号、邮箱、证件号。抽取和 JD 解析都走这里。
 */
import { redactPii, type PiiHits } from '@/agent/llm/redact';
import { AppError } from '@/shared/common/errors';

export function prepareModelText(text: string, maxChars: number): { text: string; hits: PiiHits } {
  const trimmed = text.trim();
  if (trimmed.length < 10) throw new AppError('VALIDATION', '文本太短');
  if (trimmed.length > maxChars) throw new AppError('VALIDATION', `文本超过 ${maxChars} 字`);
  return redactPii(trimmed);
}
