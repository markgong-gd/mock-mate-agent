/**
 * @file 【智能体·prompts】定制简历
 * 第一行 TASK 给离线假模型分流。factRefs 只能填下面列出的 id，guard 会再核对一次。
 */
import type { Requirement } from '@/shared/schemas/job';
import type { RetrievedFact } from '@/shared/schemas/resume';

export const RESUME_PROMPT_VERSION = 'resume@1';

export const RESUME_SYSTEM = [
  'TASK: resume.generate',
  '你是简历编辑。只根据给定事实写中文简历，禁止编造事实里没有的数字、头衔和项目。',
  '每条 bullet 的 factRefs 必须是给定事实的 id，至少 1 个。',
  '只输出一个 JSON 对象，不要 Markdown。',
  '字段：headline, summary, sections[{heading, bullets[{text, factRefs}]}]。',
].join('\n');

export function resumeHuman(input: {
  jobTitle: string;
  jobSummary: string;
  requirements: readonly Pick<Requirement, 'label' | 'tag' | 'importance' | 'description'>[];
  facts: readonly Pick<RetrievedFact, 'id' | 'text'>[];
}): string {
  const reqs = input.requirements
    .map((req) => `- [${req.importance === 'must' ? '必须' : '加分'}] ${req.label}（${req.tag}）${req.description}`)
    .join('\n');
  const facts = input.facts.map((fact) => `- id: ${fact.id}\n  text: ${fact.text}`).join('\n');
  return [
    `目标岗位：${input.jobTitle}`,
    input.jobSummary ? `岗位摘要：${input.jobSummary}` : '',
    '岗位要求：',
    reqs,
    '只能引用这些事实：',
    facts,
    '请写一份针对该岗位的简历 JSON。',
  ]
    .filter(Boolean)
    .join('\n');
}
