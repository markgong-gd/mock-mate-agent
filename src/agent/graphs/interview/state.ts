/**
 * @file 【智能体·graphs】面试图状态
 * messages 是模型的工作记忆。题目队列、游标和追问次数是业务进度，节点返回时整段覆盖。
 * jobId / settings / aborted 不在 02 的示意字段里，但开场只传入一次，中止也要在条件边里读到。
 */
import { Annotation, MessagesAnnotation } from '@langchain/langgraph';
import type { AnswerEvaluation, InterviewSettings } from '@/shared/schemas/interview';
import type { QueuedQuestion } from '@/shared/schemas/question';

export interface InterviewAnswer {
  turnId: string;
  text: string;
}

export const InterviewState = Annotation.Root({
  ...MessagesAnnotation.spec,
  questionQueue: Annotation<QueuedQuestion[]>({ reducer: (_prev, next) => next, default: () => [] }),
  cursor: Annotation<number>({ reducer: (_prev, next) => next, default: () => 0 }),
  followUpCount: Annotation<number>({ reducer: (_prev, next) => next, default: () => 0 }),
  maxFollowUps: Annotation<number>({ reducer: (_prev, next) => next, default: () => 2 }),
  lastAnswer: Annotation<InterviewAnswer | null>({ reducer: (_prev, next) => next, default: () => null }),
  lastEval: Annotation<AnswerEvaluation | null>({ reducer: (_prev, next) => next, default: () => null }),
  status: Annotation<'running' | 'finished'>({ reducer: (_prev, next) => next, default: () => 'running' }),
  aborted: Annotation<boolean>({ reducer: (_prev, next) => next, default: () => false }),
  jobId: Annotation<string>({ reducer: (_prev, next) => next, default: () => '' }),
  settings: Annotation<InterviewSettings | null>({ reducer: (_prev, next) => next, default: () => null }),
  roleTitle: Annotation<string>({ reducer: (_prev, next) => next, default: () => '前端工程师' }),
});

export type InterviewStateType = typeof InterviewState.State;
