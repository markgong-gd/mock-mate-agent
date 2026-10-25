/**
 * @file 【智能体·graphs】诊断图状态
 * scores 用追加型 reducer：Send 并行打分时每个分支只返回自己那一条，由 reducer 汇总（map-reduce）。
 * 其余字段整段覆盖。tasks 顺序固定（按轮次 seq），ref 编号由下标推出，短板的证据靠它回填 turnId。
 * ScoreTaskState 是 score_answer 节点单独的入参结构：Send 的载荷不是整份图状态。
 */
import { Annotation } from '@langchain/langgraph';
import type { DiagnosisScores, ScoredAnswer, TrainingPlan } from '@/shared/schemas/diagnosis';
import type { RubricDefinition } from '@/shared/schemas/rubric';

/** 一道待打分的题：题干来自题库，回答来自 interview_turns */
export interface ScoreTask {
  turnId: string;
  seq: number;
  questionId: string | null;
  question: string;
  answerPoints: string[];
  skillTags: string[];
  answer: string;
}

/** 回填过 turnId 的短板，可以直接落库 */
export interface ResolvedWeakness {
  tag: string;
  title: string;
  detail: string;
  severity: number;
  evidenceTurnId: string | null;
  evidenceQuote: string;
}

export const DiagnosisState = Annotation.Root({
  reportId: Annotation<string>({ reducer: (_prev, next) => next, default: () => '' }),
  sessionId: Annotation<string>({ reducer: (_prev, next) => next, default: () => '' }),
  roleTitle: Annotation<string>({ reducer: (_prev, next) => next, default: () => '目标岗位' }),
  requirementTags: Annotation<string[]>({ reducer: (_prev, next) => next, default: () => [] }),
  rubric: Annotation<RubricDefinition | null>({ reducer: (_prev, next) => next, default: () => null }),
  tasks: Annotation<ScoreTask[]>({ reducer: (_prev, next) => next, default: () => [] }),
  /**
   * 唯一的追加型字段：Send 分支各写一条，由 reducer 汇总。
   * 传空数组表示清空——重新诊断时 load 用它把上一轮的分数清掉，否则同一个 thread 会越跑越多。
   */
  scores: Annotation<ScoredAnswer[]>({
    reducer: (prev, next) => (next.length === 0 ? [] : [...prev, ...next]),
    default: () => [],
  }),
  aggregated: Annotation<DiagnosisScores | null>({ reducer: (_prev, next) => next, default: () => null }),
  weaknesses: Annotation<ResolvedWeakness[]>({ reducer: (_prev, next) => next, default: () => [] }),
  plan: Annotation<TrainingPlan | null>({ reducer: (_prev, next) => next, default: () => null }),
});

export type DiagnosisStateType = typeof DiagnosisState.State;

/**
 * score_answer 的入参：Send 载荷里带齐这一题需要的全部上下文。
 * 字段名刻意与 DiagnosisState 不重名：同名 channel 的类型必须完全一致，否则 addNode 会报冲突。
 */
export const ScoreTaskState = Annotation.Root({
  scoreTask: Annotation<ScoreTask>({ reducer: (_prev, next) => next }),
  scoreRubric: Annotation<RubricDefinition>({ reducer: (_prev, next) => next }),
  scoreRole: Annotation<string>({ reducer: (_prev, next) => next, default: () => '目标岗位' }),
});

export type ScoreTaskStateType = typeof ScoreTaskState.State;
