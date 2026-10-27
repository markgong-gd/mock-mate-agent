/**
 * @file 【公共·domain】简历标准 resume-standard@1
 * 做什么：对照档案，给一份简历正文列出能判定的问题。不改正文，不调模型。
 * 为什么不阻断导出：导出闸门只有 factRefGuard 的 unverified。这里的 error / warning 只给编辑页看。
 * 数字按子串判断：事实里的 "4" 出现在 "40" 里也算保留。这是故意放宽，避免把 "4 秒" 和 "40%" 判成两套规则。
 */
import type { ProfileBody } from '@/shared/schemas/profile';
import {
  RESUME_STANDARD_VERSION,
  type ResumeContent,
  type ResumeIssue,
  type ResumeQuality,
} from '@/shared/schemas/resume';
import { findSkillTags } from '@/shared/schemas/skill-tags';

const NUMBER_RE = /\d+(?:\.\d+)?%?/g;
const EMPTY_START = /^(负责|参与|熟悉|了解|学习能力强|吃苦耐劳)/;
const EXPERIENCE_HEADINGS = new Set(['工作经历', '项目经历', '经历', '相关经历']);
const SKILL_HEADING = '技能';
const EDUCATION_HEADINGS = new Set(['教育', '教育经历']);
const ISSUE_CAP = 40;

function numbersIn(text: string): string[] {
  return text.match(NUMBER_RE) ?? [];
}

function push(issues: ResumeIssue[], issue: ResumeIssue) {
  if (issues.length < ISSUE_CAP) issues.push(issue);
}

export function resumeStandard(content: ResumeContent, profile: ProfileBody): ResumeQuality {
  const issues: ResumeIssue[] = [];
  const skills = new Map(profile.skills.map((skill) => [skill.tag, skill]));
  const facts = new Map(
    profile.experiences.flatMap((exp) => exp.facts.map((fact) => [fact.id, fact.text] as const)),
  );

  content.sections.forEach((section, sectionIndex) => {
    if (section.bullets.length > 5) {
      push(issues, {
        level: 'warning',
        code: 'too_many_bullets',
        message: `「${section.heading}」超过 5 条，建议只留最能核对的几条`,
        path: `sections.${sectionIndex}`,
      });
    }
    section.bullets.forEach((bullet, bulletIndex) => {
      const path = `sections.${sectionIndex}.bullets.${bulletIndex}`;
      if (EMPTY_START.test(bullet.text.trim()) && !/\d/.test(bullet.text)) {
        push(issues, {
          level: 'warning',
          code: 'empty_phrase',
          message: '这条描述以空泛用词开头，且没有数字',
          path,
        });
      }
      for (const factId of bullet.factRefs) {
        const factText = facts.get(factId);
        if (!factText) continue;
        const missing = numbersIn(factText).filter((num) => !bullet.text.includes(num));
        if (missing.length > 0) {
          push(issues, {
            level: 'warning',
            code: 'dropped_number',
            message: `事实中的数字没有写进这条描述：${missing.join('、')}`,
            path,
          });
          break;
        }
      }
      if (section.heading !== SKILL_HEADING) return;
      const tags = findSkillTags(bullet.text);
      for (const tag of tags) {
        if (!skills.has(tag.tag)) {
          push(issues, {
            level: 'error',
            code: 'skill_not_in_profile',
            message: `技能栏目出现了档案里没有的标签：${tag.label}`,
            path,
          });
        }
      }
      if (bullet.text.includes('精通')) {
        const upgraded = tags.filter((tag) => skills.get(tag.tag)?.level !== 'expert');
        if (upgraded.length > 0) {
          push(issues, {
            level: 'warning',
            code: 'proficiency_upgrade',
            message: `写了「精通」，但档案里${upgraded.map((tag) => tag.label).join('、')}不是深入`,
            path,
          });
        }
      }
    });
  });

  const skillAt = content.sections.findIndex((section) => section.heading === SKILL_HEADING);
  const experienceAt = content.sections.findIndex((section) => EXPERIENCE_HEADINGS.has(section.heading));
  if (skillAt >= 0 && experienceAt >= 0 && skillAt > experienceAt) {
    push(issues, {
      level: 'warning',
      code: 'section_order',
      message: '技能栏目应排在经历之前',
      path: `sections.${skillAt}`,
    });
  }
  const educationAt = content.sections.findIndex((section) => EDUCATION_HEADINGS.has(section.heading));
  if (educationAt >= 0 && educationAt !== content.sections.length - 1) {
    push(issues, {
      level: 'warning',
      code: 'section_order',
      message: '教育栏目应排在最后',
      path: `sections.${educationAt}`,
    });
  }

  return { version: RESUME_STANDARD_VERSION, issues };
}
