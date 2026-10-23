/**
 * @file 【后端·core】模型相关用例
 * 做什么：listModelAliases 列出别名 → provider:model；pingModel 对指定别名发一次最小请求（不走 fallback）。
 */
import { HumanMessage } from '@langchain/core/messages';
import { CHAT_ALIASES, serverEnv, type ChatAlias } from '@/shared/env/server';
import { getChatModel } from '@/agent/llm/registry';
import { toLlmAppError } from '@/agent/llm/resilience';
import type { RequestCtx } from '@/shared/common/ctx';
import { AppError } from '@/shared/common/errors';
import { createUsageHandler } from './usage';

export interface PingResult {
  alias: ChatAlias;
  model: string;
  latencyMs: number;
  reply: string;
}

/** 当前别名 → provider:model（不含任何密钥） */
export function listModelAliases(): { alias: ChatAlias; model: string | null }[] {
  const models = serverEnv().llm.models;
  return CHAT_ALIASES.map((alias) => ({ alias, model: models[alias]?.id ?? null }));
}

/** 连通检查：不走 fallback，直接暴露当前别名对应模型的可用性 */
export async function pingModel(ctx: RequestCtx, alias: ChatAlias): Promise<PingResult> {
  if (!CHAT_ALIASES.includes(alias)) throw new AppError('VALIDATION', `未知别名 ${alias}`);
  const m = getChatModel(alias);
  const started = Date.now();
  const usage = createUsageHandler({ userId: ctx.userId, requestId: ctx.requestId });
  try {
    const res = await m.model.invoke([new HumanMessage('ping')], {
      callbacks: [usage],
      runName: 'llm.ping',
      metadata: { functionId: 'llm.ping', promptVersion: 'ping@1' },
      signal: AbortSignal.timeout(30_000),
    });
    const text = typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
    return { alias, model: m.id, latencyMs: Date.now() - started, reply: text.slice(0, 200) };
  } catch (e) {
    throw toLlmAppError(e);
  }
}
