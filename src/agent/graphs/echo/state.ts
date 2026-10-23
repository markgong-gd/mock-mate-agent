/**
 * @file 【智能体·graphs】回声图状态定义
 * 字段：messages（对话，追加合并）/ round（已完成轮数）/ maxRounds / status。
 * 说明：Annotation 的 reducer 决定节点返回值如何合并进状态。
 */
import { Annotation, MessagesAnnotation } from '@langchain/langgraph';

export const ECHO_DEFAULT_MAX_ROUNDS = 3;

/** 回声问答图状态：用于 P0 验证 interrupt / 存档恢复 / 流式 */
export const EchoState = Annotation.Root({
  ...MessagesAnnotation.spec,
  round: Annotation<number>({ reducer: (_prev, next) => next, default: () => 0 }),
  maxRounds: Annotation<number>({ reducer: (_prev, next) => next, default: () => ECHO_DEFAULT_MAX_ROUNDS }),
  status: Annotation<'running' | 'finished'>({ reducer: (_prev, next) => next, default: () => 'running' }),
});

export type EchoStateType = typeof EchoState.State;
export type EchoUpdateType = typeof EchoState.Update;
