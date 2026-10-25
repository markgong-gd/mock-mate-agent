/**
 * @file 【智能体·graphs】定制简历图的状态
 * load 填档案和岗位，retrieve_facts 填可引用事实，generate 填草稿，guard 改写 status，save 记下新版本 id。
 * 不使用 checkpointer：一次请求内跑完。失败不留半成品，上一版本还在表里。
 */
import { Annotation } from '@langchain/langgraph';
import type { JobView } from '@/shared/schemas/job';
import type { ProfileBody } from '@/shared/schemas/profile';
import type { ResumeContent, RetrievedFact } from '@/shared/schemas/resume';

const keep = <T>(fallback: T) => ({
  reducer: (_prev: T, next: T) => next,
  default: () => fallback,
});

export const ResumeState = Annotation.Root({
  jobId: Annotation<string>,
  profile: Annotation<ProfileBody | null>(keep<ProfileBody | null>(null)),
  job: Annotation<JobView | null>(keep<JobView | null>(null)),
  /** 放进 Prompt 的事实。guard 只允许引用这个列表里的 id */
  facts: Annotation<RetrievedFact[]>(keep<RetrievedFact[]>([])),
  draft: Annotation<ResumeContent | null>(keep<ResumeContent | null>(null)),
  guarded: Annotation<ResumeContent | null>(keep<ResumeContent | null>(null)),
  savedId: Annotation<string | null>(keep<string | null>(null)),
});

export type ResumeStateType = typeof ResumeState.State;
