/**
 * @file 【公共·domain】回声图的路由规则（纯函数）
 * 做什么：routeAfterEchoReply 决定 reply 之后走 ask（继续）还是 finish（结束）。
 * 约定：图的条件边判断都写成 domain 纯函数，不跑图、不调模型也能单测。
 */
export type EchoRoute = 'ask' | 'finish';

/** 回声图 reply 之后的路由：条件边的判断逻辑放在 domain 纯函数中（02 §1.2 约定 2） */
export function routeAfterEchoReply(input: { round: number; maxRounds: number }): EchoRoute {
  return input.round >= input.maxRounds ? 'finish' : 'ask';
}
