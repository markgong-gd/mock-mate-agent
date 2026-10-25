/**
 * @file 【公共·domain】评估之后走追问、下一题还是结束
 * 做什么：routeAfterEvaluate 是面试图条件边的唯一判断。图只负责调用它。
 * 为什么是纯函数：追问上限、最后一题、用户中止这些边界不依赖模型和数据库，单测就能盖住。
 */

export type RouteDecision = 'follow_up' | 'next' | 'finish';

export function routeAfterEvaluate(input: {
  cursor: number;
  queueLength: number;
  followUpCount: number;
  maxFollowUps: number;
  needFollowUp: boolean;
  aborted: boolean;
}): RouteDecision {
  if (input.aborted) return 'finish';
  if (input.queueLength <= 0) return 'finish';
  if (input.cursor < 0 || input.cursor >= input.queueLength) return 'finish';
  if (input.needFollowUp && input.followUpCount < input.maxFollowUps) return 'follow_up';
  if (input.cursor + 1 >= input.queueLength) return 'finish';
  return 'next';
}
