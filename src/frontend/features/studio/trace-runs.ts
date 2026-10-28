/**
 * @file 【前端·策划】把运行步骤归到每一轮助手回复下面
 * 一轮从「观察」开始，开口模型成功后对上这条助手消息。还没开口的留在当前输出下。
 */
import type { StudioTraceStep } from '@/shared/schemas/studio';

export interface StudioRunPlacement {
  /** 与助手消息按下标对齐。这一轮还没有步骤时是空数组 */
  byAssistant: StudioTraceStep[][];
  /** 还没有对上助手回复的步骤 */
  pending: StudioTraceStep[];
}

function closesRun(step: StudioTraceStep): boolean {
  if (step.status !== 'ok') return false;
  if (step.functionId === 'studio.speak') return true;
  return step.kind === 'model' && step.title.includes('studio.speak');
}

/** 每个「观察」开一轮。开口成功前的失败重试并进随后那条回复 */
function splitRuns(steps: StudioTraceStep[]): StudioTraceStep[][] {
  const runs: StudioTraceStep[][] = [];
  let current: StudioTraceStep[] = [];
  for (const step of steps) {
    if (step.kind === 'observe' && current.length > 0) {
      runs.push(current);
      current = [];
    }
    current.push(step);
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

export function placeStudioRuns(
  steps: StudioTraceStep[],
  assistantCount: number,
  streamingLast = false,
): StudioRunPlacement {
  const rounds: StudioTraceStep[][] = [];
  let pending: StudioTraceStep[] = [];
  for (const run of splitRuns(steps)) {
    pending.push(...run);
    if (run.some(closesRun)) {
      rounds.push(pending);
      pending = [];
    }
  }
  const byAssistant: StudioTraceStep[][] = Array.from({ length: assistantCount }, () => []);
  // 步骤只保留最近的。缺的是更早的回复，所以从最后一条助手消息往前对。
  // 正在开口的那条还没有成功的 speak，槽位留给 pending，不占用上一轮。
  const reserveLast = streamingLast && pending.length > 0 && assistantCount > 0;
  const settledSlots = reserveLast ? assistantCount - 1 : assistantCount;
  const fitted = rounds.slice(-settledSlots);
  fitted.forEach((round, index) => {
    byAssistant[settledSlots - fitted.length + index] = round;
  });
  if (reserveLast) byAssistant[assistantCount - 1] = pending;
  const overflow = rounds.slice(0, rounds.length - fitted.length).flat();
  return { byAssistant, pending: reserveLast ? overflow : [...overflow, ...pending] };
}
