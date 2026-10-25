/**
 * @file 【测试】短板写回档案：合并、去重、严重度与状态更新
 */
import { describe, expect, it } from 'vitest';
import {
  mergeWeaknesses,
  openWeaknesses,
  type ExistingWeakness,
  type IncomingWeakness,
} from '@/shared/domain/weakness/merge';

const DAY = 86_400_000;

const existing = (over: Partial<ExistingWeakness> = {}): ExistingWeakness => ({
  id: 'w-1',
  tag: 'react',
  title: 'React 答得不够具体',
  detail: '没有给出具体做法',
  severity: 2,
  status: 'open',
  reportId: 'r-1',
  sessionId: 's-1',
  evidenceQuote: '我就是用了一下',
  seenAt: DAY,
  ...over,
});

const incoming = (over: Partial<IncomingWeakness> = {}): IncomingWeakness => ({
  tag: 'react',
  title: 'React 还是讲不清',
  detail: '第二次仍然没有取舍',
  severity: 2,
  reportId: 'r-2',
  sessionId: 's-2',
  evidenceQuote: '大概就那样',
  seenAt: 2 * DAY,
  ...over,
});

describe('mergeWeaknesses', () => {
  it('第一次诊断：档案里就是本次的短板', () => {
    const result = mergeWeaknesses({ existing: [], incoming: [incoming()] });
    expect(result.statusChanges).toEqual([]);
    expect(result.profile).toHaveLength(1);
    expect(result.profile[0]).toMatchObject({
      tag: 'react',
      title: 'React 还是讲不清',
      status: 'open',
      occurrences: 1,
      firstSeenAt: 2 * DAY,
      lastSeenAt: 2 * DAY,
      reportId: 'r-2',
    });
  });

  it('同一技能再次出现：去重成一条，次数累加，文案与证据取最新', () => {
    const result = mergeWeaknesses({ existing: [existing()], incoming: [incoming()] });
    expect(result.profile).toHaveLength(1);
    expect(result.profile[0]).toMatchObject({
      occurrences: 2,
      title: 'React 还是讲不清',
      evidenceQuote: '大概就那样',
      firstSeenAt: DAY,
      lastSeenAt: 2 * DAY,
      status: 'open',
    });
  });

  it('严重度取历史与本次的较大值：模型这次给低了也不淡化', () => {
    const result = mergeWeaknesses({
      existing: [existing({ severity: 3 })],
      incoming: [incoming({ severity: 1 })],
    });
    expect(result.profile[0]?.severity).toBe(3);
  });

  it('本次没出现且本场该技能得分够高：历史行标 closed', () => {
    const result = mergeWeaknesses({
      existing: [existing()],
      incoming: [],
      skills: [{ tag: 'react', score: 4.2 }],
    });
    expect(result.statusChanges).toEqual([{ id: 'w-1', status: 'closed' }]);
    expect(result.profile[0]?.status).toBe('closed');
  });

  it('本次没出现但分数只是中等：标 improving', () => {
    const result = mergeWeaknesses({
      existing: [existing()],
      skills: [{ tag: 'react', score: 3 }],
    });
    expect(result.statusChanges).toEqual([{ id: 'w-1', status: 'improving' }]);
  });

  it('本场考到了但分数依然低：退回 open', () => {
    const result = mergeWeaknesses({
      existing: [existing({ status: 'improving' })],
      skills: [{ tag: 'react', score: 2 }],
    });
    expect(result.statusChanges).toEqual([{ id: 'w-1', status: 'open' }]);
  });

  it('本场没考到这个技能：状态一律不动，不会被当成已解决', () => {
    const result = mergeWeaknesses({
      existing: [existing()],
      incoming: [incoming({ tag: 'performance' })],
      skills: [{ tag: 'performance', score: 2 }],
    });
    expect(result.statusChanges).toEqual([]);
    expect(result.profile.find((item) => item.tag === 'react')?.status).toBe('open');
  });

  it('状态没变化的历史行不出现在 statusChanges 里', () => {
    const result = mergeWeaknesses({
      existing: [existing({ status: 'closed' })],
      skills: [{ tag: 'react', score: 5 }],
    });
    expect(result.statusChanges).toEqual([]);
  });

  it('同一技能的多条历史行一起改状态', () => {
    const result = mergeWeaknesses({
      existing: [existing({ id: 'w-1' }), existing({ id: 'w-2', reportId: 'r-9', seenAt: 2 * DAY })],
      skills: [{ tag: 'react', score: 5 }],
    });
    expect(result.statusChanges.map((item) => item.id).sort()).toEqual(['w-1', 'w-2']);
    expect(result.profile[0]?.occurrences).toBe(2);
  });

  it('排序：未解决在前，再按严重度和最近出现时间', () => {
    const result = mergeWeaknesses({
      existing: [
        existing({ id: 'a', tag: 'react', severity: 1, status: 'open' }),
        existing({ id: 'b', tag: 'performance', severity: 3, status: 'open' }),
        existing({ id: 'c', tag: 'testing', severity: 3, status: 'closed' }),
      ],
    });
    expect(result.profile.map((item) => item.tag)).toEqual(['performance', 'react', 'testing']);
  });

  it('只传 existing 时就是读档案：去重但不改任何状态', () => {
    const result = mergeWeaknesses({
      existing: [existing({ id: 'w-1' }), existing({ id: 'w-2', seenAt: 3 * DAY, title: '最新那条' })],
    });
    expect(result.statusChanges).toEqual([]);
    expect(result.profile).toHaveLength(1);
    expect(result.profile[0]?.title).toBe('最新那条');
  });
});

describe('openWeaknesses', () => {
  it('只留没解决的（open 与 improving），closed 不再出题', () => {
    const open = openWeaknesses([
      existing({ id: 'a', tag: 'react', status: 'open' }),
      existing({ id: 'b', tag: 'performance', status: 'improving' }),
      existing({ id: 'c', tag: 'testing', status: 'closed' }),
    ]);
    expect(open.map((item) => item.tag)).toEqual(['react', 'performance']);
  });
});
