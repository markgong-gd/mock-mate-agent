/**
 * @file 【后端·core】单场用量与成本（N-12）
 * 做什么：读 llm_calls 聚合出一场面试的 Token、耗时和钱；超过单场上限时拦住后续推进。
 * 为什么钱在这里算：单价在 agent/llm/pricing.ts，会随 provider 调价变动；
 *   落库会对不上账，所以 llm_calls 只存 token，钱每次读的时候现算（02 §5.6）。
 * 口径：诊断的模型调用也挂在面试的 sessionId 上，所以"单场成本"= 面试 + 这场的诊断。
 */
import { estimateCost, PRICE_CURRENCY, priceOf } from '@/agent/llm/pricing';
import { getInterviewSession } from '@/backend/db/repos/interviews';
import { sumSessionTokens, sumSessionUsage, type SessionUsageRow } from '@/backend/db/repos/llm-calls';
import type { RequestCtx } from '@/shared/common/ctx';
import { AppError } from '@/shared/common/errors';
import { USAGE_CURRENCY, type SessionUsage, type UsageTotals } from '@/shared/schemas/usage';
import { limits } from './config';

/** 一条都没配单价时整笔记 null；否则把配得上的加起来 */
function totalsOf(rows: readonly SessionUsageRow[]): UsageTotals {
  const priced = rows.every((row) => priceOf(row.provider, row.model) !== undefined);
  const cost = priced ? rows.reduce((sum, row) => sum + (estimateCost(row) ?? 0), 0) : null;
  return {
    calls: rows.reduce((sum, row) => sum + row.calls, 0),
    errors: rows.reduce((sum, row) => sum + row.errors, 0),
    inputTokens: rows.reduce((sum, row) => sum + row.inputTokens, 0),
    outputTokens: rows.reduce((sum, row) => sum + row.outputTokens, 0),
    cost: cost === null ? null : Math.round(cost * 1e6) / 1e6,
    currency: USAGE_CURRENCY,
  };
}

function groupBy(
  rows: readonly SessionUsageRow[],
  key: (row: SessionUsageRow) => string,
): Map<string, SessionUsageRow[]> {
  const map = new Map<string, SessionUsageRow[]>();
  for (const row of rows) map.set(key(row), [...(map.get(key(row)) ?? []), row]);
  return map;
}

export async function getSessionUsage(ctx: RequestCtx, sessionId: string): Promise<SessionUsage> {
  // 先校验归属：llm_calls.session_id 是裸 text，不能只靠它判断越权
  const session = await getInterviewSession(ctx.userId, sessionId);
  if (!session) throw new AppError('NOT_FOUND', '这场面试不存在');
  const rows = await sumSessionUsage(ctx.userId, sessionId);
  const totals = totalsOf(rows);

  const byFunction = [...groupBy(rows, (row) => row.functionId)]
    .map(([functionId, items]) => {
      const t = totalsOf(items);
      const latency = items.reduce((sum, row) => sum + row.latencyMs, 0);
      return { functionId, ...t, avgLatencyMs: t.calls > 0 ? Math.round(latency / t.calls) : 0 };
    })
    .sort((a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens));

  const byModel = [...groupBy(rows, (row) => `${row.provider}:${row.model}`)]
    .map(([model, items]) => ({
      model,
      ...totalsOf(items),
      priced: items.every((row) => priceOf(row.provider, row.model) !== undefined),
    }))
    .sort((a, b) => b.calls - a.calls);

  const used = totals.inputTokens + totals.outputTokens;
  return {
    sessionId,
    totals,
    byFunction,
    byModel,
    budget: {
      tokenLimit: limits.sessionTokenBudget,
      used,
      exceeded: used >= limits.sessionTokenBudget,
    },
  };
}

/**
 * 推进一场面试前的预算检查。超了就不再调模型——已经写进库的轮次和报告都不动，
 * 用户可以结束这场、看诊断，只是不能再往下问（N-12）。
 */
export async function assertSessionBudget(userId: string, sessionId: string): Promise<void> {
  const used = await sumSessionTokens(userId, sessionId);
  if (used < limits.sessionTokenBudget) return;
  throw new AppError(
    'BUDGET_EXCEEDED',
    `这场面试已用掉 ${used} 个 Token，超过单场上限 ${limits.sessionTokenBudget}。可以结束本场并查看诊断报告。`,
    { details: { used, tokenLimit: limits.sessionTokenBudget, currency: PRICE_CURRENCY } },
  );
}
