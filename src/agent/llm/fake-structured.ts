/**
 * @file 【智能体·llm】离线结构化草稿
 * 做什么：假模型看到 TASK 标记时，用规则拼出能通过 Zod 的 JSON，而不是回声句子。
 * 为什么：默认 .env 没有真实模型，抽取、简历生成和策划对话仍要能在本地点通。
 * 局限：不会真正理解简历，只认技能目录里的词，并把句子切成“事实”。确认页就是用来改这些草稿的。
 */
import { STUDIO_LINES } from '@/shared/domain/studio/phase';
import { findSkillTags, skillLabel, type SkillTag } from '@/shared/schemas/skill-tags';
import { emptyStudioDocument, studioDocumentSchema, type StudioDocument } from '@/shared/schemas/studio';

const TASK_PROFILE = 'TASK: profile.extract';
const TASK_JOB = 'TASK: job.extract';
const TASK_RESUME = 'TASK: resume.generate';
const TASK_ASK = 'TASK: interview.ask';
const TASK_EVALUATE = 'TASK: interview.evaluate';
const TASK_DIAG_SCORE = 'TASK: diagnosis.score';
const TASK_DIAG_WEAKNESS = 'TASK: diagnosis.weakness';
const TASK_DIAG_PLAN = 'TASK: diagnosis.plan';
const TASK_STUDIO_COACH = 'TASK: studio.coach';
const TASK_STUDIO_SPEAK = 'TASK: studio.speak';

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
          importance:
            /加分|优先|了解/.test(text) && skills.length > 1 && s === skills.at(-1) ? 'nice' : 'must',
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

function block(prompt: string, name: string): string {
  const matched = new RegExp(`${name}:\\n([\\s\\S]*?)\\nEND_${name}`).exec(prompt);
  return matched?.[1]?.trim() ?? '';
}

function blockLines(prompt: string, name: string): string[] {
  return block(prompt, name)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** 回答含糊：太短，或出现“不知道”这类词且没有展开 */
function isVague(answer: string): boolean {
  const vaguePhrase = /不知道|不太清楚|没做过|说不上|忘记了|随便/.test(answer);
  return answer.length < 12 || (vaguePhrase && answer.length < 80);
}

/** 浅回答追问，具体回答进入下一题。只认 ANSWER 块，避免把题目本身判成回答 */
function evaluateDraft(prompt: string) {
  const answer = block(prompt, 'ANSWER');
  const vague = isVague(answer);
  return {
    depth: vague ? 1 : 4,
    needFollowUp: vague,
    reason: vague ? '回答太短或没有具体做法，需要追问一次' : '回答里有具体做法，可以进入下一题',
  };
}

/** 逐题打分：按 DIMENSIONS 块原样给 key，分数只区分“含糊”和“具体” */
function scoreDraft(prompt: string) {
  const keys = blockLines(prompt, 'DIMENSIONS');
  const answer = block(prompt, 'ANSWER');
  const vague = isVague(answer);
  const base = vague ? 2 : 4;
  return {
    dimensions: (keys.length > 0 ? keys : ['tech_depth']).map((key, index) => ({
      key,
      // 错开一分，避免四个维度完全相同，雷达图看不出形状
      score: Math.min(5, Math.max(1, index % 2 === 0 ? base : base - 1)),
    })),
    comment: vague
      ? '（离线草稿）回答偏短，没有讲清具体做法和取舍。'
      : '（离线草稿）回答给出了具体做法，可以再补一句结果。',
    highlight: vague ? '' : '提到了具体做法',
    gap: vague ? '缺少具体做法与可验证的结果' : '',
  };
}

/** 短板：从 TRANSCRIPT 里挑含糊的轮次，tag 取 TAGS 块里的标签，引用那一轮的原话 */
function weaknessDraft(prompt: string) {
  const tags = blockLines(prompt, 'TAGS');
  const rows = blockLines(prompt, 'TRANSCRIPT')
    .map((line) => ({
      ref: /^\[(T\d+)\]/.exec(line)?.[1] ?? '',
      answer: (line.split('答：')[1] ?? '').trim(),
    }))
    .filter((row) => row.ref !== '' && row.answer !== '');

  // 演示 extract_weaknesses 的证据校验：一条改写了原话，一条引用了不存在的轮次
  if (prompt.includes('__bad_evidence__') && rows[0]) {
    const base = {
      title: '证据校验演示',
      detail: '（离线草稿）用于验证改写原话会被换成真实摘录、编号对不上会被丢掉。',
      severity: 2,
    };
    return {
      weaknesses: [
        {
          ...base,
          tag: tags[0] ?? 'collaboration',
          evidenceRef: rows[0].ref,
          evidenceQuote: '这句话是模型自己改写的',
        },
        { ...base, tag: tags[1] ?? 'project', evidenceRef: 'T99', evidenceQuote: '这一轮并不存在' },
      ],
    };
  }

  const vague = rows.filter((row) => isVague(row.answer));
  const picked = (vague.length > 0 ? vague : rows).slice(0, Math.max(1, Math.min(2, tags.length)));
  const used = new Set<string>();
  const weaknesses = [];
  for (const [index, row] of picked.entries()) {
    const tag = tags[index % Math.max(tags.length, 1)] ?? 'collaboration';
    if (used.has(tag)) continue;
    used.add(tag);
    weaknesses.push({
      tag,
      title: `${skillLabel(tag)}答得不够具体`,
      detail: '（离线草稿）这一轮没有给出具体做法、取舍或结果，建议补一个完整案例。',
      severity: isVague(row.answer) ? 3 : 2,
      evidenceRef: row.ref,
      evidenceQuote: row.answer.slice(0, 60),
    });
  }
  return { weaknesses };
}

/** 复训计划：WEAKNESSES 块里每条短板出一项 */
function planDraft(prompt: string) {
  const items = blockLines(prompt, 'WEAKNESSES')
    .map((line) => /^-\s*\[([a-z0-9]+)\]\s*(.*)$/.exec(line))
    .flatMap((matched) => (matched?.[1] ? [{ tag: matched[1], title: matched[2] ?? '' }] : []));
  return {
    summary:
      items.length > 0
        ? '（离线草稿）先把上面的短板各练一轮，重点是把做法和结果说清楚。'
        : '（离线草稿）本场没有明显短板，保持当前节奏即可。',
    items: items.slice(0, 6).map((item) => ({
      tag: item.tag,
      focus: `把${skillLabel(item.tag)}的回答补成完整案例`,
      actions: [
        '挑一个真实项目，按背景—做法—取舍—结果写成 5 句话并念一遍。',
        '给做法补一个可验证的数字，例如耗时、体积或错误率的变化。',
      ],
      questionCount: 3,
    })),
  };
}

function parseStudioDocument(raw: string): StudioDocument {
  try {
    return studioDocumentSchema.parse(raw ? (JSON.parse(raw) as unknown) : {});
  } catch {
    return emptyStudioDocument();
  }
}

function experienceFrom(user: string, current: StudioDocument, role: string): StudioDocument | null {
  const text = user.trim();
  if (text.length < 8) return null;
  const org = /在([\u4e00-\u9fa5A-Za-z0-9]{2,20}?)(?:做|担任|工作)/.exec(text)?.[1];
  if (org && text.includes(org)) {
    const titleMatch = /(?:做|担任)([\u4e00-\u9fa5A-Za-z0-9]{2,16})/.exec(text)?.[1] ?? '';
    const title = titleMatch && text.includes(titleMatch) ? titleMatch : '';
    const bullet = text.slice(0, 400);
    const experiences = current.experiences.map((item) => ({ ...item, bullets: [...item.bullets] }));
    const last = experiences.at(-1);
    if (last && last.org === org) {
      if (!last.bullets.includes(bullet)) last.bullets = [...last.bullets, bullet].slice(0, 8);
    } else {
      experiences.push({ org, title, start: '', end: '', bullets: [bullet] });
    }
    return {
      ...current,
      basics: { ...current.basics, headline: current.basics.headline || role.slice(0, 80) },
      experiences,
    };
  }
  if (/\d/.test(text) && current.experiences.length > 0) {
    const experiences = current.experiences.map((item) => ({ ...item, bullets: [...item.bullets] }));
    const last = experiences.at(-1);
    if (!last) return null;
    const bullet = text.slice(0, 400);
    if (!last.bullets.includes(bullet)) last.bullets = [...last.bullets, bullet].slice(0, 8);
    return { ...current, experiences };
  }
  return null;
}

/** 按 PHASE 走：先问岗位，再收经历，对得上原话才改稿 */
function studioCoachDraft(prompt: string): string {
  const phase = /PHASE: (\S+)/.exec(prompt)?.[1] ?? 'need_role';
  const user = block(prompt, 'USER');
  const materials = block(prompt, 'MATERIALS');
  const role = (/TARGET_ROLE: (.*)/.exec(prompt)?.[1] ?? '').trim();
  const current = parseStudioDocument(block(prompt, 'DOCUMENT'));
  const corpus = `${materials}\n${user}`;
  const pack = (value: unknown) => JSON.stringify(value);

  if (phase === 'confirm') {
    return pack({
      say: '这版可以导出了。看一下右侧预览，没问题就点导出 PDF。还想改的话直接说。',
      action: 'ready',
      targetRole: role,
      focus: 'summary',
      document: current,
    });
  }

  if (phase === 'need_role') {
    const first = user
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean);
    const targetRole = first && corpus.includes(first.slice(0, 40)) ? first.slice(0, 40) : '';
    return pack({
      say: targetRole
        ? `目标先记成「${targetRole}」。接下来发我一段经历：公司、职位，以及一件你做成的事。`
        : STUDIO_LINES.askRole,
      action: 'ask',
      targetRole,
      focus: 'basics',
      document: current,
    });
  }

  const built = experienceFrom(user, current, role);
  if (!built) {
    const tried = user.trim().length > 0;
    const say =
      phase === 'clarify'
        ? STUDIO_LINES.askClarify
        : phase === 'need_materials' && tried
          ? STUDIO_LINES.askMaterialsRetry
          : STUDIO_LINES.askMaterials;
    return pack({
      say,
      action: 'ask',
      targetRole: role,
      focus: 'experience',
      document: current,
    });
  }
  return pack({
    say: '我按你刚才说的改了一节，右侧已经能看到。数字都留着你的原话。',
    action: 'revise',
    targetRole: role,
    focus: 'experience',
    document: built,
  });
}

function askDraft(prompt: string): string {
  const question = block(prompt, 'QUESTION') || '请结合你的项目讲一个具体例子。';
  if (prompt.includes('FOLLOW_UP: yes')) {
    const answer = block(prompt, 'ANSWER');
    const preview = answer.length > 24 ? `${answer.slice(0, 24)}…` : answer || '刚才那句';
    return `你提到「${preview}」。能再说具体一点吗？比如当时的取舍和结果。`;
  }
  return question;
}

/**
 * 命中任务标记时返回模型该说的话。
 * 抽取、评估和诊断返回 JSON；面试官提问返回口语文本。未命中则返回 undefined，假对话继续走回声。
 */
export function fakeStructuredReply(prompt: string): string | undefined {
  if (prompt.includes(TASK_PROFILE)) return JSON.stringify(profileDraft(prompt));
  if (prompt.includes(TASK_JOB)) return JSON.stringify(jobDraft(prompt));
  if (prompt.includes(TASK_RESUME)) return JSON.stringify(resumeDraft(prompt));
  if (prompt.includes(TASK_EVALUATE)) return JSON.stringify(evaluateDraft(prompt));
  if (prompt.includes(TASK_DIAG_SCORE)) return JSON.stringify(scoreDraft(prompt));
  if (prompt.includes(TASK_DIAG_WEAKNESS)) return JSON.stringify(weaknessDraft(prompt));
  if (prompt.includes(TASK_DIAG_PLAN)) return JSON.stringify(planDraft(prompt));
  if (prompt.includes(TASK_STUDIO_SPEAK)) return block(prompt, 'SAY') || '我们继续。';
  if (prompt.includes(TASK_STUDIO_COACH)) return studioCoachDraft(prompt);
  if (prompt.includes(TASK_ASK)) return askDraft(prompt);
  return undefined;
}
