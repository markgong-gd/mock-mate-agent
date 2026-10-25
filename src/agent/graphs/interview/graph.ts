/**
 * @file 【智能体·graphs】文字面试图
 * plan_questions → ask → wait_answer(interrupt) → evaluate → 追问 / 下一题 / 结束。
 * wait_answer 不做任何写库。追问还是换题，只看 domain.routeAfterEvaluate。
 * 评估模型带 nostream，避免 JSON 被当成面试官的话流到页面上。
 * 出题读历史短板（tools.getOpenWeaknesses，userId 从 config 取），短板题由 domain.allocate 排在前面（R-C2-4）；
 * settings.drillTag 不为空时是专项训练，只问那一个技能（R-C2-5）。
 */
import type { BaseMessage } from '@langchain/core/messages';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  END,
  interrupt,
  START,
  StateGraph,
  type BaseCheckpointSaver,
  type LangGraphRunnableConfig,
} from '@langchain/langgraph';
import { getJob } from '@/backend/db/repos/jobs';
import { insertAssistantTurn, setInterviewStatus } from '@/backend/db/repos/interviews';
import { getGraphCtx } from '@/agent/graphs/config';
import { redactText } from '@/agent/llm/redact';
import { getChatRunnable, llmTimeoutSignal } from '@/agent/llm/resilience';
import { generateStructured } from '@/agent/llm/structured';
import {
  askHuman,
  askSystem,
  EVALUATE_SYSTEM,
  evaluateHuman,
  INTERVIEW_ASK_PROMPT_VERSION,
  INTERVIEW_EVALUATE_PROMPT_VERSION,
} from '@/agent/prompts/interview';
import { QuestionRetriever } from '@/agent/retrieval/question-retriever';
import { getOpenWeaknesses } from '@/agent/tools/weaknesses';
import { allocate } from '@/shared/domain/interview/allocate';
import { routeAfterEvaluate, type RouteDecision } from '@/shared/domain/interview/route';
import { AppError } from '@/shared/common/errors';
import { answerEvaluationSchema, type InterviewProgress } from '@/shared/schemas/interview';
import type { QueuedQuestion } from '@/shared/schemas/question';
import { skillLabel } from '@/shared/schemas/skill-tags';
import { InterviewState, type InterviewAnswer, type InterviewStateType } from './state';

export interface InterviewInterruptValue {
  type: 'await_answer';
  cursor: number;
  followUpCount: number;
  questionId: string;
}

export interface InterviewGraphDeps {
  plan(
    userId: string,
    state: InterviewStateType,
    config: LangGraphRunnableConfig,
  ): Promise<{ questionQueue: QueuedQuestion[]; roleTitle: string }>;
  recordAssistant(input: {
    userId: string;
    sessionId: string;
    questionId: string;
    content: string;
    isFollowUp: boolean;
  }): Promise<void>;
  markFinished(userId: string, sessionId: string): Promise<void>;
  /** 测试注入：评估真正调用模型之前抛错，用来验证失败后续跑 */
  beforeEvaluate?: () => void;
}

const messageText = (message: BaseMessage): string =>
  typeof message.content === 'string'
    ? message.content
    : message.content
        .map((part) =>
          typeof part === 'object' && 'text' in part && typeof part.text === 'string' ? part.text : '',
        )
        .join('');

function routeOf(state: InterviewStateType): RouteDecision {
  return routeAfterEvaluate({
    cursor: state.cursor,
    queueLength: state.questionQueue.length,
    followUpCount: state.followUpCount,
    maxFollowUps: state.maxFollowUps,
    needFollowUp: state.lastEval?.needFollowUp ?? false,
    aborted: state.aborted,
  });
}

function emit(
  config: LangGraphRunnableConfig,
  state: InterviewStateType,
  phase: InterviewProgress['phase'],
  cursor = state.cursor,
  followUpCount = state.followUpCount,
) {
  config.writer?.({
    type: 'interview-state',
    cursor,
    total: state.questionQueue.length,
    followUpCount,
    maxFollowUps: state.maxFollowUps,
    phase,
    questionId: state.questionQueue[cursor]?.id ?? null,
    status: phase === 'finished' ? 'finished' : state.status,
  });
}

/** 一条检索查询：技能标签 + 一句用来向量化的描述 */
interface PlanQuery {
  tag: string;
  text: string;
}

/**
 * 出题（R-C2-2、R-C2-4、R-C2-5）：
 *   专项训练（settings.drillTag）  -> 只查这一个技能
 *   普通面试                       -> 历史未解决的短板 + JD 技能点一起查，短板标签交给 allocate 排到前面
 * 每条查询单独召回，再按 id 取最高分合并，最后由 domain.allocate 决定这一场问哪些题。
 */
async function defaultPlan(userId: string, state: InterviewStateType, config: LangGraphRunnableConfig) {
  if (!state.settings) throw new AppError('VALIDATION', '面试设置缺失');
  const job = await getJob(userId, state.jobId);
  if (!job) throw new AppError('NOT_FOUND', '目标岗位不存在');

  const drillTag = state.settings.drillTag;
  const requirements = job.requirements.filter((req) => req.tag);
  let queries: PlanQuery[];
  let weaknessTags: string[];

  if (drillTag) {
    queries = [{ tag: drillTag, text: skillLabel(drillTag) }];
    weaknessTags = [drillTag];
  } else {
    if (requirements.length === 0) throw new AppError('VALIDATION', '这个岗位没有可用的技能标签');
    const open = await getOpenWeaknesses(config);
    weaknessTags = open.map((item) => item.tag);
    queries = [
      ...open.map((item) => ({ tag: item.tag, text: `${skillLabel(item.tag)} ${item.title}`.trim() })),
      ...requirements.map((req) => ({ tag: req.tag, text: `${req.label} ${req.description}`.trim() })),
    ];
  }

  const retriever = new QuestionRetriever();
  const merged = new Map<string, Awaited<ReturnType<QuestionRetriever['retrieve']>>[number]>();
  for (const query of queries) {
    const hits = await retriever.retrieve({
      skills: [query.tag],
      text: query.text,
      difficulty: [state.settings.difficultyMin, state.settings.difficultyMax],
      k: Math.max(state.settings.questionCount * 4, 20),
    });
    for (const hit of hits) {
      const prev = merged.get(hit.id);
      if (!prev || hit.score > prev.score) merged.set(hit.id, hit);
    }
  }
  const questionQueue = allocate({
    candidates: [...merged.values()],
    count: state.settings.questionCount,
    weaknessTags,
    difficultyMin: state.settings.difficultyMin,
    difficultyMax: state.settings.difficultyMax,
  });
  if (questionQueue.length === 0) {
    const what = drillTag ? `技能「${skillLabel(drillTag)}」` : '这些技能';
    throw new AppError('VALIDATION', `题库里没有覆盖${what}的题目。先运行 pnpm db:seed`);
  }
  return { questionQueue, roleTitle: drillTag ? `${job.title}（${skillLabel(drillTag)}专项）` : job.title };
}

export const defaultInterviewDeps: InterviewGraphDeps = {
  plan: defaultPlan,
  async recordAssistant(input) {
    await insertAssistantTurn(input);
  },
  async markFinished(userId, sessionId) {
    await setInterviewStatus(userId, sessionId, 'finished');
  },
};

export function buildInterviewGraph(
  checkpointer: BaseCheckpointSaver,
  deps: InterviewGraphDeps = defaultInterviewDeps,
) {
  async function planQuestions(state: InterviewStateType, config: LangGraphRunnableConfig) {
    emit(config, state, 'planning');
    const { userId } = getGraphCtx(config);
    const planned = await deps.plan(userId, state, config);
    return {
      questionQueue: planned.questionQueue,
      roleTitle: planned.roleTitle,
      cursor: 0,
      followUpCount: 0,
      maxFollowUps: state.settings?.maxFollowUps ?? state.maxFollowUps,
      status: 'running' as const,
    };
  }

  async function ask(state: InterviewStateType, config: LangGraphRunnableConfig) {
    if (state.aborted) return {};
    const decision = state.lastEval ? routeOf(state) : 'ask';
    const cursor = decision === 'next' ? state.cursor + 1 : state.cursor;
    const followUpCount =
      decision === 'follow_up' ? state.followUpCount + 1 : decision === 'next' ? 0 : state.followUpCount;
    const followUp = decision === 'follow_up';
    const question = state.questionQueue[cursor];
    if (!question) throw new AppError('INTERNAL', '面试题目队列已经空了');
    emit(config, state, 'asking', cursor, followUpCount);
    const answer = redactText(state.lastAnswer?.text ?? '').text;
    const style = state.settings?.style ?? 'standard';
    const model = getChatRunnable('chat');
    const res = await model.invoke(
      [
        new SystemMessage(askSystem(style)),
        new HumanMessage(
          askHuman({
            roleTitle: state.roleTitle,
            question,
            followUp,
            answer,
          }),
        ),
      ],
      {
        ...config,
        // ollama / fake 这类模型类没有自带超时，统一在这里套一层（N-9）
        signal: llmTimeoutSignal(config.signal),
        metadata: {
          ...config.metadata,
          functionId: 'interview.ask',
          promptVersion: INTERVIEW_ASK_PROMPT_VERSION,
        },
      },
    );
    const { userId, thread_id } = getGraphCtx(config);
    await deps.recordAssistant({
      userId,
      sessionId: thread_id,
      questionId: question.id,
      content: messageText(res),
      isFollowUp: followUp,
    });
    return { messages: [res], cursor, followUpCount };
  }

  /**
   * 只接收回答。恢复时这个节点会重跑，所以这里不能写库。
   * abort 来自“结束面试”，只改状态，仍然没有 IO。
   */
  function waitAnswer(state: InterviewStateType, config: LangGraphRunnableConfig) {
    const question = state.questionQueue[state.cursor];
    emit(config, state, 'waiting');
    const answer = interrupt<InterviewInterruptValue, InterviewAnswer & { abort?: boolean }>({
      type: 'await_answer',
      cursor: state.cursor,
      followUpCount: state.followUpCount,
      questionId: question?.id ?? '',
    });
    return {
      lastAnswer: { turnId: answer.turnId, text: answer.text },
      ...(answer.abort ? { aborted: true } : {}),
      ...(answer.text ? { messages: [new HumanMessage({ content: answer.text, id: answer.turnId })] } : {}),
    };
  }

  async function evaluate(state: InterviewStateType, config: LangGraphRunnableConfig) {
    emit(config, state, 'evaluating');
    if (state.aborted) {
      return { lastEval: { depth: 1, needFollowUp: false, reason: '用户结束了这场面试' } };
    }
    deps.beforeEvaluate?.();
    const question = state.questionQueue[state.cursor];
    if (!question) throw new AppError('INTERNAL', '评估时找不到当前题目');
    const answer = redactText(state.lastAnswer?.text ?? '').text;
    const { thread_id } = getGraphCtx(config);
    const lastEval = await generateStructured(
      'judge',
      answerEvaluationSchema,
      [new SystemMessage(EVALUATE_SYSTEM), new HumanMessage(evaluateHuman({ question, answer }))],
      {
        functionId: 'interview.evaluate',
        promptVersion: INTERVIEW_EVALUATE_PROMPT_VERSION,
        sessionId: thread_id,
      },
      { tags: ['nostream'], signal: config.signal },
    );
    return { lastEval };
  }

  async function finalize(state: InterviewStateType, config: LangGraphRunnableConfig) {
    emit(config, state, 'finished');
    const { userId, thread_id } = getGraphCtx(config);
    await deps.markFinished(userId, thread_id);
    return { status: 'finished' as const };
  }

  return new StateGraph(InterviewState)
    .addNode('plan_questions', planQuestions)
    .addNode('ask', ask)
    .addNode('wait_answer', waitAnswer)
    .addNode('evaluate', evaluate)
    .addNode('finalize', finalize)
    .addEdge(START, 'plan_questions')
    .addEdge('plan_questions', 'ask')
    .addEdge('ask', 'wait_answer')
    .addEdge('wait_answer', 'evaluate')
    .addConditionalEdges('evaluate', routeOf, { follow_up: 'ask', next: 'ask', finish: 'finalize' })
    .addEdge('finalize', END)
    .compile({ checkpointer, name: 'interview' });
}

export type InterviewGraph = ReturnType<typeof buildInterviewGraph>;
