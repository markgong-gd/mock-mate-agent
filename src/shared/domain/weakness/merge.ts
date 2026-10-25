/**
 * @file 【公共·domain】短板写回档案时的合并（R-P3「档案复利」）
 * 为什么需要合并：weaknesses 表按报告存（unique(report_id, tag)），同一个技能可能在多场面试里各有一条。
 *   档案要看到的是"这个技能到底算不算短板、现在什么状态"，所以按 tag 去重成一条。
 *
 * 两种用法，同一个函数：
 *   1) 诊断落库时：传 existing（历史行）+ incoming（本次确认的短板）+ skills（本场技能分），
 *      拿到 statusChanges 去更新历史行的状态。
 *   2) 读档案时：只传 existing，拿 profile 这一份去重后的列表（statusChanges 必然为空）。
 *
 * 状态规则（本场没考到的技能一律不动，避免"没问到"被当成"已解决"）：
 *   本次又被判为短板            -> open
 *   本次没出现，本场该技能 >= close   -> closed
 *   本次没出现，本场该技能 >= improve -> improving
 *   本次没出现，本场该技能更低        -> open（考到了但还是不行）
 * 严重度取"历史与本次的较大值"：模型某一次给低了，不会把一个反复出现的短板淡化掉。
 */
import type { WeaknessStatus } from '@/shared/schemas/weakness';

/** 技能分区间是 1–5（RUBRIC_SCORE）。改这里要同步 02 §6.5 的说明 */
export const WEAKNESS_GATE = { close: 4, improve: 3 } as const;

export interface ExistingWeakness {
  id: string;
  tag: string;
  title: string;
  detail: string;
  severity: number;
  status: WeaknessStatus;
  reportId: string;
  sessionId: string;
  evidenceQuote: string;
  /** 这条短板的产生时间（epoch ms），用于去重时取最新 */
  seenAt: number;
}

/** 本次诊断确认的短板。与 ExistingWeakness 同形，只是还没有 id 和状态 */
export type IncomingWeakness = Omit<ExistingWeakness, 'id' | 'status'>;

export interface MergeWeaknessesInput {
  existing: readonly ExistingWeakness[];
  incoming?: readonly IncomingWeakness[];
  /** 本场各技能得分（1–5），来自 domain.aggregate */
  skills?: readonly { tag: string; score: number }[];
  gate?: { close: number; improve: number };
}

export interface MergedWeakness {
  tag: string;
  title: string;
  detail: string;
  severity: number;
  status: WeaknessStatus;
  /** 这个技能累计被判为短板的次数（含本次） */
  occurrences: number;
  firstSeenAt: number;
  lastSeenAt: number;
  reportId: string;
  sessionId: string;
  evidenceQuote: string;
}

export interface MergeWeaknessesResult {
  /** 去重后的档案短板：未解决的在前，然后按严重度、最近出现时间 */
  profile: MergedWeakness[];
  /** 需要改状态的历史行；状态没变的不在里面 */
  statusChanges: { id: string; status: WeaknessStatus }[];
}

const STATUS_RANK: Record<WeaknessStatus, number> = { open: 0, improving: 1, closed: 2 };

/** 本次没出现时按本场得分判断；本场没考到这个技能则返回 undefined（保持原状态） */
function statusFromScore(
  score: number | undefined,
  gate: { close: number; improve: number },
): WeaknessStatus | undefined {
  if (score === undefined) return undefined;
  if (score >= gate.close) return 'closed';
  if (score >= gate.improve) return 'improving';
  return 'open';
}

export function mergeWeaknesses(input: MergeWeaknessesInput): MergeWeaknessesResult {
  const gate = input.gate ?? WEAKNESS_GATE;
  const incoming = new Map((input.incoming ?? []).map((item) => [item.tag, item]));
  const scores = new Map((input.skills ?? []).map((item) => [item.tag, item.score]));

  const byTag = new Map<string, ExistingWeakness[]>();
  for (const row of input.existing) {
    const bucket = byTag.get(row.tag) ?? [];
    bucket.push(row);
    byTag.set(row.tag, bucket);
  }

  const nextStatusOf = (tag: string): WeaknessStatus | undefined =>
    incoming.has(tag) ? 'open' : statusFromScore(scores.get(tag), gate);

  const statusChanges: { id: string; status: WeaknessStatus }[] = [];
  for (const [tag, rows] of byTag) {
    const next = nextStatusOf(tag);
    if (next === undefined) continue;
    for (const row of rows) {
      if (row.status !== next) statusChanges.push({ id: row.id, status: next });
    }
  }

  const profile: MergedWeakness[] = [];
  for (const tag of new Set([...byTag.keys(), ...incoming.keys()])) {
    const rows = [...(byTag.get(tag) ?? [])].sort((a, b) => a.seenAt - b.seenAt);
    const fresh = incoming.get(tag);
    const previous = rows.at(-1);
    // 本次判定优先：标题、说明、证据都用最新的一次
    const latest = fresh ?? previous;
    if (!latest) continue;
    const seenAts = [...rows.map((row) => row.seenAt), ...(fresh ? [fresh.seenAt] : [])];
    profile.push({
      tag,
      title: latest.title,
      detail: latest.detail,
      severity: Math.max(latest.severity, previous?.severity ?? 0),
      status: nextStatusOf(tag) ?? previous?.status ?? 'open',
      occurrences: rows.length + (fresh ? 1 : 0),
      firstSeenAt: Math.min(...seenAts),
      lastSeenAt: Math.max(...seenAts),
      reportId: latest.reportId,
      sessionId: latest.sessionId,
      evidenceQuote: latest.evidenceQuote,
    });
  }

  profile.sort(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      b.severity - a.severity ||
      b.lastSeenAt - a.lastSeenAt ||
      a.tag.localeCompare(b.tag),
  );
  return { profile, statusChanges };
}

/** 出题要用的"还没解决的短板"：严重度高的在前（见 03 P3-03） */
export function openWeaknesses(existing: readonly ExistingWeakness[]): MergedWeakness[] {
  return mergeWeaknesses({ existing }).profile.filter((item) => item.status !== 'closed');
}
