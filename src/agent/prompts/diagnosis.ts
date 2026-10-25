/**
 * @file 【智能体·prompts】诊断：逐题打分、短板提取、复训计划
 * 第一行 TASK 给离线假模型分流。Rubric 文本由 agent/rubrics 渲染后传进来，这里只拼字符串。
 * 短板不让模型给 turnId：只允许引用 TRANSCRIPT 里的 [T1] 编号，真实 id 和原话由图回填校验。
 */
import { RUBRIC_SCORE } from '@/shared/schemas/rubric';
import { WEAKNESS_SEVERITY } from '@/shared/schemas/weakness';

export const DIAGNOSIS_SCORE_PROMPT_VERSION = 'diagnosis-score@1';
export const DIAGNOSIS_WEAKNESS_PROMPT_VERSION = 'diagnosis-weakness@1';
export const DIAGNOSIS_PLAN_PROMPT_VERSION = 'diagnosis-plan@1';

const NO_BIAS = '不要因为性别、年龄、婚育、民族、口音或院校改变判断。';

export function scoreSystem(input: { version: string; title: string; rubricText: string }): string {
  return [
    'TASK: diagnosis.score',
    '你是面试评分员。只依据候选人这一轮的回答，按下面的评分标准打分。',
    `评分标准 ${input.version}（${input.title}）。每个维度给 ${RUBRIC_SCORE.min} 到 ${RUBRIC_SCORE.max} 的整数：`,
    input.rubricText,
    'dimensions 必须恰好覆盖 DIMENSIONS 块里列出的 key，不要增减、不要改名。',
    'comment 用一句中文说明为什么给这个分，不超过 100 字。',
    'highlight 写回答里确实答到的点，gap 写缺的点；没有就给空字符串。',
    '参考要点只用来判断答没答到，不要在点评里照搬成“标准答案”。',
    NO_BIAS,
  ].join('\n');
}

export function scoreHuman(input: {
  roleTitle: string;
  dimensionKeys: readonly string[];
  question: string;
  answerPoints: readonly string[];
  answer: string;
}): string {
  return [
    `目标岗位：${input.roleTitle}`,
    'DIMENSIONS:',
    input.dimensionKeys.join('\n'),
    'END_DIMENSIONS',
    'QUESTION:',
    input.question,
    'END_QUESTION',
    'POINTS:',
    input.answerPoints.length > 0
      ? input.answerPoints.map((point) => `- ${point}`).join('\n')
      : '- （这道题没有录入参考要点，按岗位常识判断）',
    'END_POINTS',
    'ANSWER:',
    input.answer,
    'END_ANSWER',
  ].join('\n');
}

export const WEAKNESS_SYSTEM = [
  'TASK: diagnosis.weakness',
  '你是面试复盘教练。读完整场面试，挑出最值得改进的短板，最多 4 条，按严重程度从高到低。',
  'tag 只能取 TAGS 块里列出的技能标签。',
  'evidenceRef 只能是 TRANSCRIPT 里出现过的轮次编号（形如 T1）。',
  'evidenceQuote 必须原样抄那一轮回答里的一句话，不要改写、不要翻译、不要拼接。',
  `severity：${WEAKNESS_SEVERITY.min} 轻微，2 明显，${WEAKNESS_SEVERITY.max} 严重。`,
  'title 不超过 20 字；detail 说明为什么判定为短板，不超过 150 字。',
  '同一个技能标签最多一条。没有明显短板时返回空数组。不要编造没出现过的内容。',
  NO_BIAS,
].join('\n');

export function weaknessHuman(input: {
  roleTitle: string;
  tags: readonly string[];
  transcript: readonly string[];
}): string {
  return [
    `目标岗位：${input.roleTitle}`,
    'TAGS:',
    input.tags.join('\n'),
    'END_TAGS',
    'TRANSCRIPT:',
    input.transcript.join('\n'),
    'END_TRANSCRIPT',
  ].join('\n');
}

export const PLAN_SYSTEM = [
  'TASK: diagnosis.plan',
  '你是面试教练，要为候选人安排下一轮练习。针对每条短板给一项计划，不要新增短板。',
  'tag 与短板的技能标签保持一致；focus 一句话说明这次要练什么，不超过 30 字。',
  'actions 给 1 到 3 条可以当天开始做的具体动作，每条不超过 80 字，不要空话。',
  'questionCount 是建议的专项练习题数，1 到 10。',
  'summary 用两句话总结下一步重点，不超过 120 字。',
  '没有短板时 items 返回空数组，summary 写保持当前节奏即可。',
  NO_BIAS,
].join('\n');

export function planHuman(input: {
  roleTitle: string;
  weaknesses: readonly { tag: string; title: string; detail: string }[];
  skills: readonly { tag: string; score: number }[];
}): string {
  return [
    `目标岗位：${input.roleTitle}`,
    'WEAKNESSES:',
    input.weaknesses.length > 0
      ? input.weaknesses.map((item) => `- [${item.tag}] ${item.title}：${item.detail}`).join('\n')
      : '- （无）',
    'END_WEAKNESSES',
    'SKILLS:',
    input.skills.length > 0
      ? input.skills.map((item) => `- ${item.tag}: ${item.score}`).join('\n')
      : '- （无）',
    'END_SKILLS',
  ].join('\n');
}

/** TRANSCRIPT 的一行。编号与短板的 evidenceRef 对应 */
export function transcriptLine(input: { ref: string; question: string; answer: string }): string {
  const flat = (text: string) => text.replace(/\s+/g, ' ').trim();
  return `[${input.ref}] 题：${flat(input.question)} ｜ 答：${flat(input.answer)}`;
}
