/**
 * @file 【智能体·llm】韧性：超时、降级、错误归一
 * 做什么：getChatRunnable(alias) 返回带 MODEL_FALLBACK 兜底的 Runnable（图节点使用）；
 *        withFallback 用于非流式调用；toLlmAppError 把 provider 错误归一为 AppError(LLM_*)。
 */
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Runnable } from '@langchain/core/runnables';
import type { BaseMessage } from '@langchain/core/messages';
import { AppError, isAppError } from '@/shared/common/errors';
import { logger } from '@/shared/common/logger';
import { getChatModel, hasChatModel, type ChatAlias, type ResolvedChatModel } from './registry';

const isAbortLike = (e: unknown) =>
  e instanceof Error &&
  (e.name === 'AbortError' || e.name === 'TimeoutError' || /abort|timed? ?out/i.test(e.message));

/** 把 provider / 网络错误归一为 AppError(LLM_*) */
export function toLlmAppError(e: unknown): AppError {
  if (isAppError(e)) return e;
  if (isAbortLike(e)) return new AppError('LLM_TIMEOUT', undefined, { cause: e });
  return new AppError('LLM_UNAVAILABLE', undefined, { cause: e });
}

/**
 * 调用 → 失败（模型类自带 429/5xx 指数退避重试）→ 切 MODEL_FALLBACK 再试 1 次 → 抛 AppError(LLM_*)（02 §5.3）。
 * 调用方主动中止（signal 已 aborted）时不降级。
 */
export async function withFallback<T>(
  alias: ChatAlias,
  run: (m: ResolvedChatModel) => Promise<T>,
  opts: { signal?: AbortSignal } = {},
): Promise<T> {
  const primary = getChatModel(alias);
  try {
    return await run(primary);
  } catch (e) {
    if (opts.signal?.aborted) throw toLlmAppError(e);
    if (alias === 'fallback' || !hasChatModel('fallback')) throw toLlmAppError(e);
    const fb = getChatModel('fallback');
    if (fb.id === primary.id) throw toLlmAppError(e);
    logger.warn(
      { alias, from: primary.id, to: fb.id, err: errSummary(e) },
      'llm call failed, switching to fallback',
    );
    try {
      return await run(fb);
    } catch (e2) {
      throw toLlmAppError(e2);
    }
  }
}

/** 图节点中流式调用：带 fallback 的 Runnable（LangChain withFallbacks） */
export function getChatRunnable(alias: ChatAlias): Runnable<BaseMessage[], BaseMessage> | BaseChatModel {
  const primary = getChatModel(alias);
  if (alias === 'fallback' || !hasChatModel('fallback')) return primary.model;
  const fb = getChatModel('fallback');
  if (fb.id === primary.id) return primary.model;
  return primary.model.withFallbacks([fb.model]);
}

/** 组合调用方 signal 与超时 */
export function timeoutSignal(ms: number, signal?: AbortSignal): AbortSignal {
  const t = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, t]) : t;
}

export const errSummary = (e: unknown) =>
  e instanceof Error
    ? { name: e.name, message: e.message.slice(0, 200) }
    : { message: String(e).slice(0, 200) };
