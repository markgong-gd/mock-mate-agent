/**
 * @file 【智能体·llm】离线结构化草稿
 * 做什么：假模型看到 TASK 标记时，用规则拼出能通过 Zod 的 JSON，而不是回声句子。
 * 为什么：默认 .env 没有真实模型，P1 的抽取和简历生成仍要能在本地点通。
 * 局限：不会真正理解简历，只认技能目录里的词，并把句子切成“事实”。确认页就是用来改这些草稿的。
 */
import { findSkillTags, skillLabel, type SkillTag } from '@/shared/schemas/skill-tags';

const TASK_PROFILE = 'TASK: profile.extract';
const TASK_JOB = 'TASK: job.extract';
const TASK_RESUME = 'TASK: resume.generate';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function dataBlock(text: string): string {
  const marked = /<<<DATA\n([\s\S]*?)\nDATA/.exec(text);
  return (marked?.[1] ?? text).replace(/\[(PHONE|EMAIL|ID)\]/g, ' ');
}

function sentences(text: string): string[] {
  return text
    .split(/[。！？\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8)
    .slice(0, 4);
}

function skillsOf(text: string): { name: string; tag: SkillTag }[] {
  const found = findSkillTags(text);
  if (found.length > 0) return found.map((s) => ({ name: s.label, tag: s.tag }));
  return [{ name: skillLabel('collaboration'), tag: 'collaboration' }];
}

function profileDraft(raw: string) {
  const text = dataBlock(raw);
  const facts = sentences(text);
  const factTexts = (facts.length > 0 ? facts : ['请在确认页补充一条可核对的事实']).map((line) => ({
    text: line.slice(0, 200),
  }));
  const skills = skillsOf(text);
  return {
    headline: `${skills[0]?.name ?? '前端'}方向`,
    summary: factTexts[0]?.text ?? '请在确认页补充简介',
    experiences: [
      {
        company: '待确认公司',
        title: '待确认职位',
        start: '2020-01',
        end: null,
        summary: '',
        facts: factTexts,
      },
    ],
    skills,
  };
}

function jobDraft(raw: string) {
  const text = dataBlock(raw);
  const firstLine = text
    .split('\n')
    .map((s) => s.trim())
    .find((s) => s.length > 0);
  const skills = findSkillTags(text);
  const requirements =
    skills.length > 0
      ? skills.map((s) => ({
          label: s.label,
          tag: s.tag,
          importance: /加分|优先|了解/.test(text) && skills.length > 1 && s === skills.at(-1) ? 'nice' : 'must',
          description: '',
        }))
      : [
          {
            label: '协作沟通',
            tag: 'collaboration' as const,
            importance: 'nice' as const,
            description: '未能识别技能标签，请在页面上改成 JD 里的真实要求',
          },
        ];
  return {
    title: (firstLine ?? '目标岗位').slice(0, 40),
    company: null,
    summary: text.replace(/\s+/g, ' ').slice(0, 120),
    requirements,
  };
}

function resumeDraft(raw: string) {
  const ids = [...new Set(raw.match(UUID_RE) ?? [])];
  const bullets = (ids.length > 0 ? ids.slice(0, 6) : ['00000000-0000-4000-8000-000000000099']).map((id) => ({
    text: '（离线草稿）请按对应事实改写这条成果描述。',
    factRefs: [id],
  }));
  if (raw.includes('__bad_fact_ref__') && ids[0]) {
    bullets.push({
      text: '这条引用是故意编造的，用于演示 guard。',
      factRefs: ['99999999-9999-4999-8999-999999999999'],
    });
  }
  return {
    headline: '前端工程师',
    summary: '以下描述均应能回溯到档案中的事实，请核对后再导出。',
    sections: [{ heading: '相关经历', bullets }],
  };
}

/** 命中任务标记时返回 JSON 字符串，否则返回 undefined，假对话模型继续走回声 */
export function fakeStructuredReply(prompt: string): string | undefined {
  if (prompt.includes(TASK_PROFILE)) return JSON.stringify(profileDraft(prompt));
  if (prompt.includes(TASK_JOB)) return JSON.stringify(jobDraft(prompt));
  if (prompt.includes(TASK_RESUME)) return JSON.stringify(resumeDraft(prompt));
  return undefined;
}
