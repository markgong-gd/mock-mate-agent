/**
 * @file 【智能体·graphs】定制简历图
 * 结构：load → retrieve_facts → generate → guard → standard → save
 * guard 与 standard 都不调模型。没有 jobId 时是主简历：按经历顺序带入事实，不读岗位。
 * 生成函数可以注入，图测试因此能覆盖“编造引用”和标准检查。
 */
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { END, START, StateGraph } from '@langchain/langgraph';
import { getJob } from '@/backend/db/repos/jobs';
import { getProfile, listFactSnippets, listFactsInExperienceOrder } from '@/backend/db/repos/profile';
import { insertResumeVersion } from '@/backend/db/repos/resumes';
import { getGraphCtx } from '@/agent/graphs/config';
import { redactText } from '@/agent/llm/redact';
import { getChatRunnable, llmTimeoutSignal } from '@/agent/llm/resilience';
import { extractJson, generateStructured } from '@/agent/llm/structured';
import { FactRetriever } from '@/agent/retrieval/fact-retriever';
import { RESUME_PROMPT_VERSION, RESUME_SYSTEM, resumeHuman } from '@/agent/prompts/resume';
import { factRefGuard } from '@/shared/domain/resume/fact-ref-guard';
import { resumeStandard } from '@/shared/domain/resume/standard';
import { rankByOverlap } from '@/shared/domain/retrieval/overlap';
import { AppError } from '@/shared/common/errors';
import type { JobView } from '@/shared/schemas/job';
import type { ProfileBody } from '@/shared/schemas/profile';
import {
  resumeContentSchema,
  type ResumeContent,
  type ResumeQuality,
  type RetrievedFact,
} from '@/shared/schemas/resume';
import { ResumeState, type ResumeStateType } from './state';

export interface ResumeDelta {
  type: 'resume-delta';
  text: string;
}

export const isResumeDelta = (value: unknown): value is ResumeDelta =>
  typeof value === 'object' &&
  value !== null &&
  (value as ResumeDelta).type === 'resume-delta' &&
  typeof (value as ResumeDelta).text === 'string';

/** 主简历一次放进 Prompt 的事实上限。个人档案通常远小于这个数 */
export const MASTER_FACT_LIMIT = 24;

export interface ResumeGenerateInput {
  profile: ProfileBody;
  job: JobView | null;
  facts: RetrievedFact[];
}

export interface ResumeGraphDeps {
  load(userId: string, jobId: string | null): Promise<{ profile: ProfileBody; job: JobView | null }>;
  retrieve(userId: string, job: JobView | null): Promise<RetrievedFact[]>;
  generate(
    input: ResumeGenerateInput,
    onDelta: (text: string) => void,
    config: LangGraphRunnableConfig,
  ): Promise<ResumeContent>;
  save(
    userId: string,
    jobId: string | null,
    content: ResumeContent,
    quality: ResumeQuality,
  ): Promise<{ id: string }>;
}

async function defaultRetrieve(userId: string, job: JobView | null): Promise<RetrievedFact[]> {
  if (!job) {
    const snippets = await listFactsInExperienceOrder(userId);
    if (snippets.length === 0) throw new AppError('VALIDATION', '档案里还没有可引用的事实');
    return snippets.slice(0, MASTER_FACT_LIMIT).map((fact) => ({
      id: fact.id,
      experienceId: fact.experienceId,
      text: fact.text,
      score: 0,
    }));
  }
  const retriever = new FactRetriever(userId, { k: 4 });
  const merged = new Map<string, RetrievedFact>();
  for (const req of job.requirements) {
    const hits = await retriever.retrieve(`${job.title} ${req.label} ${req.description}`);
    for (const hit of hits) {
      const prev = merged.get(hit.id);
      if (!prev || hit.score > prev.score) merged.set(hit.id, hit);
    }
  }
  const ranked = [...merged.values()].sort((a, b) => b.score - a.score).slice(0, 12);
  if (ranked.length > 0) return ranked;

  // 向量还没写好，或哈希向量没撞上时，用词面重合挑事实。再没有就带上全部，保证 Prompt 里有真实 id。
  const snippets = await listFactSnippets(userId);
  if (snippets.length === 0) throw new AppError('VALIDATION', '档案里还没有可引用的事实');
  const query = job.requirements.map((req) => `${req.label} ${req.description}`).join(' ');
  const overlapped = rankByOverlap(
    query,
    snippets.map((fact) => ({ ...fact, skillTags: [] as string[] })),
    12,
  );
  const chosen = overlapped.length > 0 ? overlapped : snippets.slice(0, 12);
  return chosen.map((fact) => ({ id: fact.id, experienceId: fact.experienceId, text: fact.text, score: 0 }));
}

/**
 * 事实原文是用户确认过的档案内容，仍可能夹着联系方式（"项目联系人 138..."），
 * 所以进 Prompt 之前统一过一遍脱敏（N-3、03 P3-07）。factRefs 用 id，脱敏不影响溯源。
 */
async function defaultGenerate(
  input: ResumeGenerateInput,
  onDelta: (text: string) => void,
  config: LangGraphRunnableConfig,
): Promise<ResumeContent> {
  const messages = [
    new SystemMessage(RESUME_SYSTEM),
    new HumanMessage(
      resumeHuman({
        jobTitle: input.job?.title,
        jobSummary: input.job ? redactText(input.job.summary).text : undefined,
        requirements: input.job?.requirements.map((req) => ({
          ...req,
          description: redactText(req.description).text,
        })),
        skills: input.profile.skills.map((skill) => ({
          name: skill.name,
          tag: skill.tag,
          level: skill.level,
        })),
        facts: input.facts.map((fact) => ({ id: fact.id, text: redactText(fact.text).text })),
      }),
    ),
  ];
  const model = getChatRunnable('chat');
  let text = '';
  const stream = await model.stream(messages, {
    ...config,
    // ollama / fake 这类模型类没有自带超时，统一在这里套一层（N-9）
    signal: llmTimeoutSignal(config.signal),
    runName: 'resume.generate',
  });
  for await (const chunk of stream) {
    const piece = typeof chunk.content === 'string' ? chunk.content : '';
    if (!piece) continue;
    text += piece;
    onDelta(piece);
  }
  const extracted = extractJson(text);
  const parsed = extracted.ok ? resumeContentSchema.safeParse(extracted.value) : null;
  if (parsed?.success) return parsed.data;
  return generateStructured('chat', resumeContentSchema, messages, {
    functionId: 'resume.generate',
    promptVersion: RESUME_PROMPT_VERSION,
  });
}

export const defaultResumeDeps: ResumeGraphDeps = {
  async load(userId, jobId) {
    const profile = await getProfile(userId);
    if (!profile) throw new AppError('NOT_FOUND', '请先确认职业档案');
    if (!jobId) return { profile, job: null };
    const job = await getJob(userId, jobId);
    if (!job) throw new AppError('NOT_FOUND', '目标岗位不存在');
    return { profile, job };
  },
  retrieve: defaultRetrieve,
  generate: defaultGenerate,
  async save(userId, jobId, content, quality) {
    const saved = await insertResumeVersion(userId, jobId, content, quality);
    return { id: saved.id };
  },
};

export function buildResumeGraph(deps: ResumeGraphDeps = defaultResumeDeps) {
  async function load(state: ResumeStateType, config: LangGraphRunnableConfig) {
    const { userId } = getGraphCtx(config);
    return deps.load(userId, state.jobId);
  }

  async function retrieveFacts(state: ResumeStateType, config: LangGraphRunnableConfig) {
    const { userId } = getGraphCtx(config);
    if (state.jobId && !state.job) throw new AppError('INTERNAL', '简历图缺少岗位');
    return { facts: await deps.retrieve(userId, state.job) };
  }

  async function generate(state: ResumeStateType, config: LangGraphRunnableConfig) {
    if (!state.profile) throw new AppError('INTERNAL', '简历图缺少档案');
    if (state.jobId && !state.job) throw new AppError('INTERNAL', '简历图缺少岗位');
    const draft = await deps.generate(
      { profile: state.profile, job: state.job, facts: state.facts },
      (text) => config.writer?.({ type: 'resume-delta', text }),
      config,
    );
    return { draft };
  }

  function guard(state: ResumeStateType) {
    if (!state.draft) throw new AppError('INTERNAL', '简历图缺少草稿');
    const { content } = factRefGuard(
      state.draft,
      state.facts.map((fact) => fact.id),
    );
    return { guarded: content };
  }

  function standard(state: ResumeStateType) {
    if (!state.guarded || !state.profile) throw new AppError('INTERNAL', '简历图缺少校验结果');
    return { quality: resumeStandard(state.guarded, state.profile) };
  }

  async function save(state: ResumeStateType, config: LangGraphRunnableConfig) {
    const { userId } = getGraphCtx(config);
    if (!state.guarded || !state.quality) throw new AppError('INTERNAL', '简历图缺少校验结果');
    const saved = await deps.save(userId, state.jobId, state.guarded, state.quality);
    return { savedId: saved.id };
  }

  return new StateGraph(ResumeState)
    .addNode('load', load)
    .addNode('retrieve_facts', retrieveFacts)
    .addNode('generate', generate)
    .addNode('guard', guard)
    .addNode('standard', standard)
    .addNode('save', save)
    .addEdge(START, 'load')
    .addEdge('load', 'retrieve_facts')
    .addEdge('retrieve_facts', 'generate')
    .addEdge('generate', 'guard')
    .addEdge('guard', 'standard')
    .addEdge('standard', 'save')
    .addEdge('save', END)
    .compile({ name: 'resume' });
}

export type ResumeGraph = ReturnType<typeof buildResumeGraph>;

export { RESUME_PROMPT_VERSION };
