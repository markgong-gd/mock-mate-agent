/**
 * @file 【公共·domain】策划阶段
 * 模型可以提议 ask / revise / ready，能不能这么做由这里决定。
 * 没有岗位不能改稿，没有「可以了」不能结束，对不上原话的改稿会退回追问。
 */
import type { StudioCoachProposal, StudioDocument, StudioFocus, StudioStatus } from '@/shared/schemas/studio';
import { guardStudioDocument, mentionedIn, studioDocumentsEqual } from './guard';

export type StudioPhase = 'need_role' | 'need_materials' | 'clarify' | 'revise' | 'confirm';

export const STUDIO_LINES = {
  askRole: '你想应聘什么岗位？级别大概是初级、中级还是高级？',
  askRoleRetry:
    '这句里还没有能用的目标岗位。请直接写岗位和级别，例如：中级前端。岗位这几个字要原样出现在你的话里。',
  askMaterials: '把一段经历发我：公司、职位、你做成了什么。有数字最好。也可以直接粘贴旧简历。',
  askMaterialsRetry:
    '这句还不能写进简历。请用一句原话同时写上公司、职位，以及一件做成的事，最好带一个你自己的数字。例如：我在某公司做前端，把首屏从 4 秒降到 1.8 秒。',
  askClarify: '这条还缺一个能核对的结果。请在原话里补一个数字，例如：耗时从 4 秒降到 1.8 秒，或覆盖 3 个页面。',
  askDropped:
    '有些公司、职位或数字对不上你说过的内容，我先没写进简历。请用原话补一整句，公司、职位和数字都要出现在这句里。例如：我在某公司做前端，把首屏从 4 秒降到 1.8 秒。',
  ready: '这版可以导出了。看一下右侧预览，没问题就点「导出 PDF」。还想改的话直接说。',
} as const;

const VAGUE_START = /^(负责|参与|熟悉|了解|学习能力强|吃苦耐劳)/;

export function isStudioConfirm(text: string): boolean {
  const compact = text.replace(/[\s。！!，,]/g, '');
  if (!compact || compact.length > 16) return false;
  return (
    /可以了|满意了|就这样|不用改了|这版可以|可以导出|导出吧/.test(compact) ||
    /^导出(PDF|pdf)?$/i.test(compact)
  );
}

export function hasStudioSubstance(document: StudioDocument): boolean {
  return Boolean(
    document.basics.headline.trim() ||
    document.basics.name.trim() ||
    document.summary.trim() ||
    document.skills.length > 0 ||
    document.experiences.length > 0 ||
    document.projects.length > 0 ||
    document.education.length > 0,
  );
}

function hasMaterials(document: StudioDocument): boolean {
  return (
    document.experiences.some((item) => item.org.trim() || item.bullets.length > 0) ||
    document.projects.some((item) => item.name.trim() || item.bullets.length > 0) ||
    document.skills.length > 0 ||
    document.summary.trim().length >= 20
  );
}

function needsClarify(document: StudioDocument): boolean {
  const vague = [...document.experiences, ...document.projects].some((item) =>
    item.bullets.some((bullet) => VAGUE_START.test(bullet.trim()) && !/\d/.test(bullet)),
  );
  const emptyResult = document.experiences.some((item) => item.org.trim() && item.bullets.length === 0);
  return vague || emptyResult;
}

export function studioPhase(input: {
  targetRole: string;
  document: StudioDocument;
  userText: string;
}): StudioPhase {
  if (isStudioConfirm(input.userText) && hasStudioSubstance(input.document)) return 'confirm';
  if (!input.targetRole.trim()) return 'need_role';
  if (!hasMaterials(input.document)) return 'need_materials';
  if (needsClarify(input.document)) return 'clarify';
  return 'revise';
}

export interface SettledTurn {
  action: 'ask' | 'revise' | 'ready';
  say: string;
  document: StudioDocument;
  focus: StudioFocus;
  targetRole: string;
  status: StudioStatus;
  /** 模型原本提议的动作。规则可能改掉它 */
  proposedAction: 'ask' | 'revise' | 'ready';
  /** 防编造丢掉的字段数。没走到改稿时是 0 */
  dropped: number;
  /** 给运行记录看的一句原因 */
  reason: string;
}

function asks(say: string): boolean {
  return /[？?]/.test(say);
}

/** 已经用例子说明了怎样才符合，就不必再换成定稿 */
function givesExample(say: string): boolean {
  return /例如|比如/.test(say);
}

function fallbackAsk(phase: StudioPhase, say: string): string {
  if (asks(say)) return say;
  if (phase === 'need_role') return STUDIO_LINES.askRole;
  if (phase === 'clarify') return STUDIO_LINES.askClarify;
  if (phase === 'need_materials') return STUDIO_LINES.askMaterials;
  return say || STUDIO_LINES.askClarify;
}

function focusForAsk(phase: StudioPhase, proposed: StudioFocus): StudioFocus {
  if (phase === 'need_role' || phase === 'confirm') return 'basics';
  if (phase === 'need_materials' || phase === 'clarify') return 'experience';
  return proposed;
}

export function settleCoachTurn(input: {
  phase: StudioPhase;
  proposal: StudioCoachProposal;
  corpus: string;
  previous: StudioDocument;
  userText: string;
  targetRole: string;
}): SettledTurn {
  let targetRole = input.targetRole.trim();
  const proposedRole = input.proposal.targetRole.trim();
  if (proposedRole && mentionedIn(input.corpus, proposedRole)) targetRole = proposedRole;

  const proposedAction = input.proposal.action;

  if (input.phase === 'confirm') {
    return {
      action: 'ready',
      say: /导出/.test(input.proposal.say) ? input.proposal.say : STUDIO_LINES.ready,
      document: input.previous,
      focus: 'summary',
      targetRole,
      status: 'ready',
      proposedAction,
      dropped: 0,
      reason: '用户确认这版可以导出。简历保持原样，不采用提案里的新稿。',
    };
  }

  let action = proposedAction === 'ready' ? 'ask' : proposedAction;
  let say = input.proposal.say.trim() || STUDIO_LINES.askRole;
  let document = input.previous;
  const focus = input.proposal.focus;
  let dropped = 0;
  let reason =
    proposedAction === 'ready'
      ? '还没到可以导出的阶段，结束被退回，改为追问。'
      : proposedAction === 'ask'
        ? '模型选择追问，这一轮不改简历。'
        : '按原话改了一节。';

  if (action === 'revise') {
    if (!targetRole) {
      action = 'ask';
      say = /岗位/.test(say) ? say : STUDIO_LINES.askRole;
      reason = '还没有目标岗位，改稿被退回，改为追问岗位。';
    } else {
      const guarded = guardStudioDocument(input.previous, input.proposal.document, input.corpus);
      dropped = guarded.dropped;
      if (studioDocumentsEqual(input.previous, guarded.document)) {
        action = 'ask';
        say = guarded.dropped > 0 ? STUDIO_LINES.askDropped : fallbackAsk(input.phase, say);
        reason =
          guarded.dropped > 0
            ? `有 ${guarded.dropped} 处公司、职级、学校或数字对不上原话，没有写入简历，改为追问。`
            : '提案和当前稿没有可写入的差别，改为追问。';
      } else {
        document = guarded.document;
        reason =
          guarded.dropped > 0
            ? `按原话改了一节，另有 ${guarded.dropped} 处对不上，没有写入。`
            : '按原话改了一节。';
        if (guarded.dropped > 0) say = `有一处对不上你说过的内容，我先没写进去。${say}`;
      }
    }
  }

  if (action === 'ask' && dropped === 0 && input.userText.trim()) {
    if (!targetRole && !givesExample(say)) {
      say = STUDIO_LINES.askRoleRetry;
      reason = '这句里还没有能用的目标岗位，改为说明怎样才符合。';
    } else if (targetRole && input.phase === 'clarify' && !givesExample(say)) {
      say = STUDIO_LINES.askClarify;
      reason = '这句还缺一个能核对的数字，改为说明怎样才符合。';
    } else if (targetRole && !hasMaterials(document) && input.phase !== 'need_role' && !givesExample(say)) {
      say = STUDIO_LINES.askMaterialsRetry;
      reason = '这句还写不进简历，改为说明怎样的一句才符合。';
    }
  }
  if (action === 'ask' && !targetRole && !/岗位/.test(say)) say = STUDIO_LINES.askRole;
  if (action === 'ask' && targetRole && !hasMaterials(document) && input.phase !== 'need_role') {
    if (!asks(say) && !/经历|简历/.test(say) && !givesExample(say)) say = STUDIO_LINES.askMaterials;
  }

  return {
    action,
    say,
    document,
    focus: action === 'revise' ? focus : focusForAsk(input.phase, focus),
    targetRole,
    status: 'active',
    proposedAction,
    dropped,
    reason,
  };
}
