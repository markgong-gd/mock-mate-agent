/**
 * @file 【智能体·graphs】C3 诊断图
 * 结构：load → fan_out(Send 每题一个) → score_answer → aggregate → extract_weaknesses → plan_training → persist
 * score_answer 并行跑，结果靠 state.scores 的追加型 reducer 汇总；aggregate 只调 domain.aggregate，不调模型。
 * 短板的证据在这里回填：模型只给 [T1] 编号和一句原话，编号对不上或原话不在那一轮里就换成真实摘录，
 * 保证“每个短板都有证据”（R-C3-2）。落库放在 persist 单事务里，中途失败可以从断点续跑。
 */
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  END,
  Send,
  START,
  StateGraph,
  type BaseCheckpointSaver,
  type LangGraphRunnableConfig,
} from '@langchain/langgraph';
import { getReport, saveDiagnosis, getRubric, type SaveDiagnosisInput } from '@/backend/db/repos/diagnosis';
import { listInterviewTurns } from '@/backend/db/repos/interviews';
import { getJob } from '@/backend/db/repos/jobs';
import { getQuestionsByIds } from '@/backend/db/repos/questions';
import { getGraphCtx } from '@/agent/graphs/config';
import { redactText } from '@/agent/llm/redact';
import { generateStructured } from '@/agent/llm/structured';
import {
  DIAGNOSIS_PLAN_PROMPT_VERSION,
  DIAGNOSIS_SCORE_PROMPT_VERSION,
  DIAGNOSIS_WEAKNESS_PROMPT_VERSION,
  PLAN_SYSTEM,
  planHuman,
  scoreHuman,
  scoreSystem,
  transcriptLine,
  WEAKNESS_SYSTEM,
  weaknessHuman,
} from '@/agent/prompts/diagnosis';
import { rubricDimensionKeys, rubricPromptText } from '@/agent/rubrics/v1';
import { aggregate } from '@/shared/domain/diagnosis/aggregate';
import { AppError } from '@/shared/common/errors';
import {
  answerScoreSchema,
  trainingPlanSchema,
  type DiagnosisScores,
  type ScoredAnswer,
} from '@/shared/schemas/diagnosis';
import { skillLabel } from '@/shared/schemas/skill-tags';
import { weaknessExtractOutputSchema } from '@/shared/schemas/weakness';
import {
  DiagnosisState,
  ScoreTaskState,
  type DiagnosisStateType,
  type ResolvedWeakness,
  type ScoreTask,
  type ScoreTaskStateType,
} from './state';

export interface DiagnosisLoaded {
  sessionId: string;
  roleTitle: string;
  requirementTags: string[];
  rubric: DiagnosisStateType['rubric'];
  tasks: ScoreTask[];
}

export interface DiagnosisGraphDeps {
  load(userId: string, reportId: string): Promise<DiagnosisLoaded>;
  persist(input: SaveDiagnosisInput): Promise<void>;
  /** 测试注入：某一题真正调模型之前抛错，用来验证失败后续跑 */
  beforeScore?: (turnId: string) => void;
}

const refOf = (index: number) => `T${index + 1}`;

const flat = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * 配对出可打分的轮次：每条用户回答取它前面最近的面试官轮次当题干。
 * 题干优先用题库原文（稳定、不含 PII）；题库里找不到时退回面试官那句话。
 */
async function defaultLoad(userId: string, reportId: string): Promise<DiagnosisLoaded> {
  const report = await getReport(userId, reportId);
  if (!report) throw new AppError('NOT_FOUND', '诊断报告不存在');
  const rubric = await getRubric(report.rubricVersion);
  if (!rubric) {
    throw new AppError('VALIDATION', `评分标准 ${report.rubricVersion} 还没有入库，先运行 pnpm db:seed`);
  }
  const job = await getJob(userId, report.jobId);
  const turns = await listInterviewTurns(userId, report.sessionId);
  const bank = await getQuestionsByIds(turns.flatMap((turn) => (turn.questionId ? [turn.questionId] : [])));

  const tasks: ScoreTask[] = [];
  let lastAsked: { questionId: string | null; content: string } | null = null;
  for (const turn of turns) {
    if (turn.role === 'assistant') {
      lastAsked = { questionId: turn.questionId, content: turn.content };
      continue;
    }
    const answer = turn.content.trim();
    if (answer === '') continue;
    const questionId = turn.questionId ?? lastAsked?.questionId ?? null;
    const question = questionId ? bank.get(questionId) : undefined;
    tasks.push({
      turnId: turn.id,
      seq: turn.seq,
      questionId,
      question: question?.content ?? lastAsked?.content ?? '（题干缺失）',
      answerPoints: question?.answerPoints ?? [],
      skillTags: question?.skillTags ?? [],
      answer,
    });
  }

  return {
    sessionId: report.sessionId,
    roleTitle: job?.title ?? '目标岗位',
    requirementTags: job?.requirements.map((req) => req.tag) ?? [],
    rubric: rubric.definition,
    tasks,
  };
}

export const defaultDiagnosisDeps: DiagnosisGraphDeps = {
  load: defaultLoad,
  persist: saveDiagnosis,
};

export function buildDiagnosisGraph(
  checkpointer: BaseCheckpointSaver,
  deps: DiagnosisGraphDeps = defaultDiagnosisDeps,
) {
  /** load 失败后会重跑，所以这里顺手把 scores 清空：重新诊断时不叠加上一轮的分数 */
  async function load(state: DiagnosisStateType, config: LangGraphRunnableConfig) {
    const { userId } = getGraphCtx(config);
    const loaded = await deps.load(userId, state.reportId);
    return { ...loaded, scores: [] };
  }

  /** 每题一个分支；一场面试没有任何回答时直接去聚合，报告仍然生成 */
  function fanOut(state: DiagnosisStateType): Send[] | 'aggregate' {
    if (!state.rubric || state.tasks.length === 0) return 'aggregate';
    const scoreRubric = state.rubric;
    return state.tasks.map(
      (scoreTask) => new Send('score_answer', { scoreTask, scoreRubric, scoreRole: state.roleTitle }),
    );
  }

  async function scoreAnswer(state: ScoreTaskStateType, config: LangGraphRunnableConfig) {
    const { scoreTask: task, scoreRubric: rubric } = state;
    deps.beforeScore?.(task.turnId);
    const { thread_id } = getGraphCtx(config);
    const score = await generateStructured(
      'judge',
      answerScoreSchema,
      [
        new SystemMessage(
          scoreSystem({
            version: rubric.version,
            title: rubric.title,
            rubricText: rubricPromptText(rubric),
          }),
        ),
        new HumanMessage(
          scoreHuman({
            roleTitle: state.scoreRole,
            dimensionKeys: rubricDimensionKeys(rubric),
            question: task.question,
            answerPoints: task.answerPoints,
            answer: redactText(task.answer).text,
          }),
        ),
      ],
      {
        functionId: 'diagnosis.score',
        promptVersion: DIAGNOSIS_SCORE_PROMPT_VERSION,
        sessionId: thread_id,
      },
      { tags: ['nostream'], signal: config.signal },
    );
    const scored: ScoredAnswer = {
      ...score,
      turnId: task.turnId,
      seq: task.seq,
      questionId: task.questionId,
      question: task.question,
      skillTags: task.skillTags,
      score: 0, // aggregate 里按 Rubric 权重算出来后回填
    };
    return { scores: [scored] };
  }

  function aggregateScores(state: DiagnosisStateType) {
    if (!state.rubric) throw new AppError('INTERNAL', '诊断图缺少评分标准');
    const answers = [...state.scores].sort((a, b) => a.seq - b.seq);
    const result = aggregate({
      dimensions: state.rubric.dimensions.map((d) => ({ key: d.key, label: d.label, weight: d.weight })),
      answers,
    });
    const aggregated: DiagnosisScores = {
      overall: result.overall,
      dimensions: result.dimensions.map((d) => ({
        key: d.key as DiagnosisScores['dimensions'][number]['key'],
        label: d.label,
        weight: d.weight,
        score: d.score,
      })),
      skills: result.skills.map((skill) => ({
        tag: skill.tag,
        label: skillLabel(skill.tag),
        score: skill.score,
        count: skill.count,
      })),
      answers: answers.map((answer, index) => ({ ...answer, score: result.answerScores[index] ?? 0 })),
    };
    return { aggregated };
  }

  async function extractWeaknesses(state: DiagnosisStateType, config: LangGraphRunnableConfig) {
    const tasks = [...state.tasks].sort((a, b) => a.seq - b.seq);
    if (tasks.length === 0) return { weaknesses: [] };
    const allowed = [
      ...new Set([...state.requirementTags, ...tasks.flatMap((task) => task.skillTags)]),
    ].filter((tag) => tag !== '');
    if (allowed.length === 0) return { weaknesses: [] };

    const byRef = new Map(tasks.map((task, index) => [refOf(index), task]));
    const { thread_id } = getGraphCtx(config);
    const output = await generateStructured(
      'judge',
      weaknessExtractOutputSchema,
      [
        new SystemMessage(WEAKNESS_SYSTEM),
        new HumanMessage(
          weaknessHuman({
            roleTitle: state.roleTitle,
            tags: allowed,
            transcript: tasks.map((task, index) =>
              transcriptLine({
                ref: refOf(index),
                question: task.question,
                answer: redactText(task.answer).text,
              }),
            ),
          }),
        ),
      ],
      {
        functionId: 'diagnosis.weakness',
        promptVersion: DIAGNOSIS_WEAKNESS_PROMPT_VERSION,
        sessionId: thread_id,
      },
      { tags: ['nostream'], signal: config.signal },
    );

    const allowedSet = new Set(allowed);
    const seen = new Set<string>();
    const resolved: ResolvedWeakness[] = [];
    for (const draft of output.weaknesses) {
      const task = byRef.get(draft.evidenceRef);
      // 编号对不上就是编的证据，直接丢掉；同一技能只留第一条
      if (!task || !allowedSet.has(draft.tag) || seen.has(draft.tag)) continue;
      seen.add(draft.tag);
      const quote = flat(draft.evidenceQuote);
      const answer = flat(task.answer);
      resolved.push({
        tag: draft.tag,
        title: draft.title,
        detail: draft.detail,
        severity: draft.severity,
        evidenceTurnId: task.turnId,
        // 原话不在那一轮里（模型改写了）就换成真实摘录，证据必须可核对
        evidenceQuote: quote !== '' && answer.includes(quote) ? quote : answer.slice(0, 200),
      });
    }
    return { weaknesses: resolved };
  }

  async function planTraining(state: DiagnosisStateType, config: LangGraphRunnableConfig) {
    const { thread_id } = getGraphCtx(config);
    const plan = await generateStructured(
      'chat',
      trainingPlanSchema,
      [
        new SystemMessage(PLAN_SYSTEM),
        new HumanMessage(
          planHuman({
            roleTitle: state.roleTitle,
            weaknesses: state.weaknesses.map((item) => ({
              tag: item.tag,
              title: item.title,
              detail: item.detail,
            })),
            skills: state.aggregated?.skills ?? [],
          }),
        ),
      ],
      { functionId: 'diagnosis.plan', promptVersion: DIAGNOSIS_PLAN_PROMPT_VERSION, sessionId: thread_id },
      { tags: ['nostream'], signal: config.signal },
    );
    // 计划只能针对已确认的短板，模型多给的直接丢掉
    const tags = new Set(state.weaknesses.map((item) => item.tag));
    return { plan: { ...plan, items: plan.items.filter((item) => tags.has(item.tag)) } };
  }

  async function persist(state: DiagnosisStateType, config: LangGraphRunnableConfig) {
    const { userId } = getGraphCtx(config);
    if (!state.aggregated || !state.plan || !state.rubric) {
      throw new AppError('INTERNAL', '诊断图缺少打分结果');
    }
    await deps.persist({
      userId,
      reportId: state.reportId,
      sessionId: state.sessionId,
      rubricVersion: state.rubric.version,
      scores: state.aggregated,
      plan: state.plan,
      weaknesses: state.weaknesses,
    });
    return {};
  }

  return new StateGraph(DiagnosisState)
    .addNode('load', load)
    .addNode('score_answer', scoreAnswer, { input: ScoreTaskState })
    .addNode('aggregate', aggregateScores)
    .addNode('extract_weaknesses', extractWeaknesses)
    .addNode('plan_training', planTraining)
    .addNode('persist', persist)
    .addEdge(START, 'load')
    .addConditionalEdges('load', fanOut, ['score_answer', 'aggregate'])
    .addEdge('score_answer', 'aggregate')
    .addEdge('aggregate', 'extract_weaknesses')
    .addEdge('extract_weaknesses', 'plan_training')
    .addEdge('plan_training', 'persist')
    .addEdge('persist', END)
    .compile({ checkpointer, name: 'diagnosis' });
}

export type DiagnosisGraph = ReturnType<typeof buildDiagnosisGraph>;
