/**
 * @file 【公共·schemas】技能标签目录
 * 做什么：简历、JD、题库共用的一套标签。skillGap 和以后的出题都按 tag 对齐，而不是按自由文本。
 * 为什么用封闭目录：标签一致，匹配结果才解释得通。代价是新技能要先加进目录，确认页才能选。
 * 别名只用于“从一段文字里认出标签”（离线假模型和提示词示例），不参与 skillGap。
 */
import { z } from 'zod';

export const SKILL_TAG_VALUES = [
  'javascript',
  'typescript',
  'html',
  'css',
  'react',
  'vue',
  'nextjs',
  'node',
  'performance',
  'engineering',
  'testing',
  'accessibility',
  'state',
  'network',
  'browser',
  'collaboration',
  'project',
] as const;

export type SkillTag = (typeof SKILL_TAG_VALUES)[number];

export const skillTagSchema = z.enum(SKILL_TAG_VALUES);

export const SKILL_CATALOG: readonly { tag: SkillTag; label: string; aliases: readonly string[] }[] = [
  { tag: 'javascript', label: 'JavaScript', aliases: ['javascript', 'js', 'es6'] },
  { tag: 'typescript', label: 'TypeScript', aliases: ['typescript', 'ts'] },
  { tag: 'html', label: 'HTML', aliases: ['html', 'html5'] },
  { tag: 'css', label: 'CSS', aliases: ['css', 'css3', 'scss', 'sass'] },
  { tag: 'react', label: 'React', aliases: ['react', 'react.js', 'reactjs', 'jsx'] },
  { tag: 'vue', label: 'Vue', aliases: ['vue', 'vue.js', 'vuejs'] },
  { tag: 'nextjs', label: 'Next.js', aliases: ['next.js', 'nextjs'] },
  { tag: 'node', label: 'Node.js', aliases: ['node.js', 'nodejs', 'node'] },
  { tag: 'performance', label: '前端性能', aliases: ['性能优化', 'performance', 'web vitals', '首屏'] },
  { tag: 'engineering', label: '工程化', aliases: ['工程化', 'webpack', 'vite', '构建'] },
  { tag: 'testing', label: '测试', aliases: ['单元测试', '测试', 'jest', 'vitest', 'playwright'] },
  { tag: 'accessibility', label: '无障碍', aliases: ['无障碍', 'a11y', 'accessibility'] },
  { tag: 'state', label: '状态管理', aliases: ['状态管理', 'redux', 'zustand', 'mobx'] },
  { tag: 'network', label: '网络与协议', aliases: ['websocket', 'graphql', 'http'] },
  { tag: 'browser', label: '浏览器原理', aliases: ['浏览器', '事件循环', '渲染原理'] },
  { tag: 'collaboration', label: '协作沟通', aliases: ['跨团队', '沟通协作', '协作'] },
  { tag: 'project', label: '项目推进', aliases: ['项目管理', '排期', '项目推进'] },
];

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 短英文别名（js、ts）必须按词边界匹配，避免 js 命中 json */
function includesAlias(hay: string, alias: string): boolean {
  const folded = hay.toLowerCase();
  const needle = alias.toLowerCase();
  if (/[\u4e00-\u9fff]/.test(needle) || needle.length > 2) return folded.includes(needle);
  return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(needle)}(?:$|[^a-z0-9])`, 'i').test(folded);
}

export function skillLabel(tag: string): string {
  return SKILL_CATALOG.find((s) => s.tag === tag)?.label ?? tag;
}

/** 从一段自由文本里找出目录中的标签。顺序与目录一致，同一 tag 只出现一次 */
export function findSkillTags(text: string): { tag: SkillTag; label: string }[] {
  const found: { tag: SkillTag; label: string }[] = [];
  for (const item of SKILL_CATALOG) {
    if (item.aliases.some((alias) => includesAlias(text, alias))) {
      found.push({ tag: item.tag, label: item.label });
    }
  }
  return found;
}

/** 写进抽取 Prompt，约束模型只能输出这些 tag */
export function skillTagPromptLines(): string {
  return SKILL_CATALOG.map((s) => `- ${s.tag}（${s.label}）`).join('\n');
}
