/**
 * @file 【智能体·prompts】文字面试的提问和评估
 * 第一行 TASK 给离线假模型分流。参考要点只放在提示里，面试官不能念出来。
 */
import type { InterviewStyle } from '@/shared/schemas/interview';
import type { QueuedQuestion } from '@/shared/schemas/question';

export const INTERVIEW_ASK_PROMPT_VERSION = 'interview-ask@1';
export const INTERVIEW_EVALUATE_PROMPT_VERSION = 'interview-evaluate@1';

const STYLE_LINE: Record<InterviewStyle, string> = {
  supportive: '语气鼓励：先接住对方已经说对的部分，再问下一个具体点。',
  standard: '语气中性、专业，像一场常规技术面试。',
  strict: '语气直接：含糊的地方立刻追问，不要替对方把答案补全。',
};

export function askSystem(style: InterviewStyle): string {
  return [
    'TASK: interview.ask',
    '你是模拟面试官，正在面试一位前端工程师。这是练习，不是真实面试的场外提示。',
    STYLE_LINE[style],
    '只说两到四句口语。不要列大纲，不要给参考答案，不要评价“标准答案如下”。',
    'FOLLOW_UP 为 yes 时，只追问刚才那道题，让对方补一个具体做法、取舍或结果。',
    'FOLLOW_UP 为 no 时，问 QUESTION 里的题，可以稍微口语化，但不要换成另一道题。',
    '参考要点只供你判断该往哪追，禁止念给候选人。',
  ].join('\n');
}

export function askHuman(input: {
  roleTitle: string;
  question: QueuedQuestion;
  followUp: boolean;
  answer: string;
}): string {
  const points = input.question.answerPoints.map((point) => `- ${point}`).join('\n');
  return [
    `目标岗位：${input.roleTitle}`,
    `FOLLOW_UP: ${input.followUp ? 'yes' : 'no'}`,
    'QUESTION:',
    input.question.content,
    'END_QUESTION',
    '参考要点：',
    points,
    'END_POINTS',
    input.followUp ? 'ANSWER:' : '',
    input.followUp ? input.answer : '',
    input.followUp ? 'END_ANSWER' : '',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

export const EVALUATE_SYSTEM = [
  'TASK: interview.evaluate',
  '你是面试评估员。根据题目、参考要点和候选人刚才的回答，判断这一次回答的深度。',
  'depth 是 1 到 5 的整数：1 几乎没答到，3 有部分依据，5 有具体做法和取舍。',
  'needFollowUp 为 true 表示回答含糊、缺例子或没碰到关键要点。已经具体就为 false。',
  'reason 用一句中文，不超过 80 字。',
  '不要因为性别、年龄、婚育、民族或口音改变判断。',
].join('\n');

export function evaluateHuman(input: { question: QueuedQuestion; answer: string }): string {
  const points = input.question.answerPoints.map((point) => `- ${point}`).join('\n');
  return [
    'QUESTION:',
    input.question.content,
    'END_QUESTION',
    '参考要点：',
    points,
    'ANSWER:',
    input.answer,
    'END_ANSWER',
  ].join('\n');
}
