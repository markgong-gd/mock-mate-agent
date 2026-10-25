/**
 * @file 【智能体·graphs】简历 / JD 抽取图
 * 做什么：单节点图。extract 调结构化输出，结果放进 state.draft，不落库。
 * 为什么还要做成图：和后面的多节点图同一套写法（StateGraph、invoke）。这条链路没有 interrupt，所以不挂 checkpointer。
 * 代价：刷新页面不会从半截抽取恢复，只能再点一次。抽取一次就结束，这个代价可以接受。
 */
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { END, START, StateGraph, Annotation, type LangGraphRunnableConfig } from '@langchain/langgraph';
import { redactText } from '@/agent/llm/redact';
import { generateStructured } from '@/agent/llm/structured';
import {
  JOB_EXTRACT_PROMPT_VERSION,
  JOB_EXTRACT_SYSTEM,
  jobExtractHuman,
} from '@/agent/prompts/extract-job';
import {
  PROFILE_EXTRACT_PROMPT_VERSION,
  PROFILE_EXTRACT_SYSTEM,
  profileExtractHuman,
} from '@/agent/prompts/extract-profile';
import { jobExtractOutputSchema, type JobExtractOutput } from '@/shared/schemas/job';
import { profileExtractOutputSchema, type ProfileExtractOutput } from '@/shared/schemas/profile';

const overwrite = <T>() => ({ reducer: (_prev: T, next: T) => next, default: () => null as T });

const ProfileState = Annotation.Root({
  text: Annotation<string>,
  draft: Annotation<ProfileExtractOutput | null>(overwrite()),
});

const JobState = Annotation.Root({
  text: Annotation<string>,
  draft: Annotation<JobExtractOutput | null>(overwrite()),
});

type ExtractFn<T> = (text: string, config?: LangGraphRunnableConfig) => Promise<T>;

async function defaultProfileExtract(text: string, config?: LangGraphRunnableConfig): Promise<ProfileExtractOutput> {
  // 脱敏放在图里，而不是只靠路由记得做。直接 invoke 这张图也发不出手机号。
  const redacted = redactText(text).text;
  return generateStructured(
    'extract',
    profileExtractOutputSchema,
    [new SystemMessage(PROFILE_EXTRACT_SYSTEM), new HumanMessage(profileExtractHuman(redacted))],
    { functionId: 'profile.extract', promptVersion: PROFILE_EXTRACT_PROMPT_VERSION },
    { callbacks: config?.callbacks, signal: config?.signal },
  );
}

async function defaultJobExtract(text: string, config?: LangGraphRunnableConfig): Promise<JobExtractOutput> {
  const redacted = redactText(text).text;
  return generateStructured(
    'extract',
    jobExtractOutputSchema,
    [new SystemMessage(JOB_EXTRACT_SYSTEM), new HumanMessage(jobExtractHuman(redacted))],
    { functionId: 'job.extract', promptVersion: JOB_EXTRACT_PROMPT_VERSION },
    { callbacks: config?.callbacks, signal: config?.signal },
  );
}

export function buildProfileExtractGraph(extract: ExtractFn<ProfileExtractOutput> = defaultProfileExtract) {
  return new StateGraph(ProfileState)
    .addNode('extract', async (state, config) => ({ draft: await extract(state.text, config) }))
    .addEdge(START, 'extract')
    .addEdge('extract', END)
    .compile({ name: 'extract-profile' });
}

export function buildJobExtractGraph(extract: ExtractFn<JobExtractOutput> = defaultJobExtract) {
  return new StateGraph(JobState)
    .addNode('extract', async (state, config) => ({ draft: await extract(state.text, config) }))
    .addEdge(START, 'extract')
    .addEdge('extract', END)
    .compile({ name: 'extract-job' });
}

export type ProfileExtractGraph = ReturnType<typeof buildProfileExtractGraph>;
export type JobExtractGraph = ReturnType<typeof buildJobExtractGraph>;
