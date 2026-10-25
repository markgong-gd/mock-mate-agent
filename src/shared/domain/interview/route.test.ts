/**
 * @file 【测试】评估后的路由：追问、追问到顶、题目用尽、中止、空队列
 */
import { describe, expect, it } from 'vitest';
import { routeAfterEvaluate } from './route';

const base = {
  cursor: 0,
  queueLength: 3,
  followUpCount: 0,
  maxFollowUps: 2,
  needFollowUp: true,
  aborted: false,
};

describe('routeAfterEvaluate', () => {
  it('回答需要展开且还没到上限时追问', () => {
    expect(routeAfterEvaluate(base)).toBe('follow_up');
  });

  it('追问次数达到上限后进入下一题，即使仍然觉得浅', () => {
    expect(routeAfterEvaluate({ ...base, followUpCount: 2 })).toBe('next');
  });

  it('上限是 0 时从不追问', () => {
    expect(routeAfterEvaluate({ ...base, maxFollowUps: 0 })).toBe('next');
  });

  it('回答已经具体，后面还有题，就下一题', () => {
    expect(routeAfterEvaluate({ ...base, needFollowUp: false })).toBe('next');
  });

  it('最后一题不再追问时结束', () => {
    expect(routeAfterEvaluate({ ...base, cursor: 2, needFollowUp: false })).toBe('finish');
  });

  it('最后一题追问到上限后结束，而不是再要一题', () => {
    expect(routeAfterEvaluate({ ...base, cursor: 2, followUpCount: 2 })).toBe('finish');
  });

  it('用户中止时直接结束，哪怕本来该追问', () => {
    expect(routeAfterEvaluate({ ...base, aborted: true })).toBe('finish');
  });

  it('队列是空的，或游标已经越界，就结束', () => {
    expect(routeAfterEvaluate({ ...base, queueLength: 0 })).toBe('finish');
    expect(routeAfterEvaluate({ ...base, cursor: 3 })).toBe('finish');
    expect(routeAfterEvaluate({ ...base, cursor: -1 })).toBe('finish');
  });
});
