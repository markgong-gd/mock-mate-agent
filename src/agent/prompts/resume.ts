/**
 * @file 【智能体·prompts】定制简历
 * 第一行 TASK 给离线假模型分流。factRefs 只能填下面列出的 id，guard 会再核对一次。
 */
import type { Requirement } from '@/shared/schemas/job';
import type { RetrievedFact } from '@/shared/schemas/resume';

export const RESUME_PROMPT_VERSION = 'resume@2';

export const RESUME_SYSTEM = [
  'TASK: resume.generate',
  '你是简历编辑。只根据给定事实写中文简历，禁止编造事实里没有的数字、头衔和项目。',
  '每条 bullet 的 factRefs 必须是给定事实的 id，至少 1 个。',
  '写作：动词开头，一条一事，保留事实里的数字，不要把熟练度写成高于给定技术栈的级别。',
  '栏目从这些名字里选：技能、工作经历、项目经历。没有对应事实就不要单开栏目。',
  '只输出一个 JSON 对象，不要 Markdown。',
  '字段：headline, summary, sections[{heading, bullets[{text, factRefs}]}]。',
].join('\n');

export function resumeHuman(input: {
  jobTitle?: string;
  jobSummary?: string;
  requirements?: readonly Pick<Requirement, 'label' | 'tag' | 'importance' | 'description'>[];
  skills: readonly { name: string; tag: string; level: string }[];
  facts: readonly Pick<RetrievedFact, 'id' | 'text'>[];
}): string {
  const facts = input.facts.map((fact) => `- id: ${fact.id}\n  text: ${fact.text}`).join('\n');
  const skills = input.skills.map((skill) => `- ${skill.name}（${skill.tag}，${skill.level}）`).join('\n');
  const tailored = Boolean(input.jobTitle);
  const reqs = (input.requirements ?? [])
    .map(
      (req) =>
        `- [${req.importance === 'must' ? '必须' : '加分'}] ${req.label}（${req.tag}）${req.description}`,
    )
    .join('\n');
  return [
    tailored ? `目标岗位：${input.jobTitle}` : '这是一份个人主简历，不针对具体岗位。',
    input.jobSummary ? `岗位摘要：${input.jobSummary}` : '',
    tailored ? '岗位要求：' : '',
    tailored ? reqs : '',
    '技术栈（level 只能照写，不能升级）：',
    skills,
    '只能引用这些事实：',
    facts,
    tailored ? '请写一份针对该岗位的简历 JSON。' : '请写一份个人主简历 JSON。',
  ]
    .filter(Boolean)
    .join('\n');
}
