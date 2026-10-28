/**
 * @file 【前端·策划】运行步骤归轮
 */
import { describe, expect, it } from 'vitest';
import type { StudioTraceStep } from '@/shared/schemas/studio';
import { placeStudioRuns } from './trace-runs';

function step(patch: Partial<StudioTraceStep> & Pick<StudioTraceStep, 'id' | 'kind' | 'title'>): StudioTraceStep {
  return {
    seq: 0,
    status: 'ok',
    at: '2026-10-28T00:00:00.000Z',
    ...patch,
  };
}

describe('placeStudioRuns', () => {
  it('把每一轮开口成功的步骤归到对应的助手回复', () => {
    const first = [
      step({ id: 'o1', kind: 'observe', title: '观察：need_role' }),
      step({ id: 'c1', kind: 'model', title: '模型 studio.coach', functionId: 'studio.coach' }),
      step({ id: 's1', kind: 'model', title: '模型 studio.speak', functionId: 'studio.speak' }),
    ];
    const second = [
      step({ id: 'o2', kind: 'observe', title: '观察：revise' }),
      step({ id: 's2', kind: 'model', title: '模型 studio.speak', functionId: 'studio.speak' }),
    ];
    const placed = placeStudioRuns([...first, ...second], 2);
    expect(placed.byAssistant.map((round) => round.map((item) => item.id))).toEqual([
      ['o1', 'c1', 's1'],
      ['o2', 's2'],
    ]);
    expect(placed.pending).toEqual([]);
  });

  it('开口还在进行时，步骤留在 pending，不占已经说完的那一轮', () => {
    const done = [
      step({ id: 'o1', kind: 'observe', title: '观察：need_role' }),
      step({ id: 's1', kind: 'model', title: '模型 studio.speak', functionId: 'studio.speak' }),
    ];
    const live = [
      step({ id: 'o2', kind: 'observe', title: '观察：revise' }),
      step({
        id: 's2',
        kind: 'model',
        title: '模型 studio.speak',
        functionId: 'studio.speak',
        status: 'running',
      }),
    ];
    const placed = placeStudioRuns([...done, ...live], 1);
    expect(placed.byAssistant[0]?.map((item) => item.id)).toEqual(['o1', 's1']);
    expect(placed.pending.map((item) => item.id)).toEqual(['o2', 's2']);
  });

  it('步骤比回复少时，对到最近的几条，不占最早那几轮', () => {
    const round = [
      step({ id: 'o2', kind: 'observe', title: '观察：revise' }),
      step({ id: 's2', kind: 'model', title: '模型 studio.speak', functionId: 'studio.speak' }),
    ];
    const placed = placeStudioRuns(round, 2);
    expect(placed.byAssistant.map((item) => item.map((step) => step.id))).toEqual([[], ['o2', 's2']]);
    expect(placed.pending).toEqual([]);
  });

  it('正在生成的回复单独占最后一槽，不把上一轮的步骤挪过来', () => {
    const done = [
      step({ id: 'o1', kind: 'observe', title: '观察：need_role' }),
      step({ id: 's1', kind: 'model', title: '模型 studio.speak', functionId: 'studio.speak' }),
    ];
    const live = [
      step({ id: 'o2', kind: 'observe', title: '观察：revise' }),
      step({
        id: 'c2',
        kind: 'model',
        title: '模型 studio.coach',
        functionId: 'studio.coach',
        status: 'running',
      }),
    ];
    const placed = placeStudioRuns([...done, ...live], 2, true);
    expect(placed.byAssistant.map((item) => item.map((step) => step.id))).toEqual([
      ['o1', 's1'],
      ['o2', 'c2'],
    ]);
    expect(placed.pending).toEqual([]);
  });

  it('同一轮里失败后重试的步骤，并进后来那条助手回复', () => {
    const steps = [
      step({ id: 'o1', kind: 'observe', title: '观察：need_role' }),
      step({ id: 'e1', kind: 'model', title: '模型 studio.coach', status: 'error' }),
      step({ id: 'o2', kind: 'observe', title: '观察：need_role' }),
      step({ id: 's2', kind: 'model', title: '模型 studio.speak', functionId: 'studio.speak' }),
    ];
    const placed = placeStudioRuns(steps, 1);
    expect(placed.byAssistant[0]?.map((item) => item.id)).toEqual(['o1', 'e1', 'o2', 's2']);
    expect(placed.pending).toEqual([]);
  });
});
