/**
 * @file 【公共·schemas】职业档案
 * 两套形状：
 * - profileExtractOutputSchema：模型输出。没有 id，没有联系方式（联系方式不进模型）。
 * - profileBodySchema：用户确认后的档案。服务端补上 id，联系方式由用户提交。
 *   技能熟练度和证据事实也在这里，不在抽取输出里。标为深入必须引用本档案的事实。
 * 为什么拆开：模型不该发明 UUID，也不该看见手机号。id 在确认前由服务端分配，便于编辑时保持稳定。
 */
import { z } from 'zod';
import { skillTagSchema } from './skill-tags';

const factText = z.object({
  text: z.string().trim().min(1, '事实不能为空').max(500),
});

export const factSchema = factText.extend({
  id: z.uuid(),
});

const experienceExtractSchema = z.object({
  company: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(80),
  /** 建议 YYYY-MM，确认页可以改 */
  start: z.string().trim().min(1).max(20),
  /** null 表示至今 */
  end: z.string().trim().min(1).max(20).nullable(),
  summary: z.string().trim().max(400).optional().default(''),
  facts: z.array(factText).min(1, '每段经历至少一条可核对的事实'),
});

export const experienceSchema = experienceExtractSchema.extend({
  id: z.uuid(),
  facts: z.array(factSchema).min(1),
});

const skillExtractSchema = z.object({
  name: z.string().trim().min(1).max(40),
  tag: skillTagSchema,
});

/** 用过 / 熟练 / 深入。抽取图不输出这项，确认时默认为 used */
export const skillLevelSchema = z.enum(['used', 'proficient', 'expert']);

export const skillSchema = skillExtractSchema.extend({
  id: z.uuid(),
  level: skillLevelSchema.default('used'),
  /** 标为 expert 时至少一条，且必须是本次档案里的事实 id */
  evidenceFactIds: z.array(z.uuid()).default([]),
});

export const contactSchema = z.object({
  name: z.string().trim().min(1, '请填写姓名').max(40),
  phone: z.string().trim().max(32).optional().default(''),
  email: z.string().trim().max(120).optional().default(''),
});

/** 发给模型、也从模型收回的档案草稿 */
export const profileExtractOutputSchema = z.object({
  headline: z.string().trim().min(1).max(80),
  summary: z.string().trim().min(1).max(600),
  experiences: z.array(experienceExtractSchema).min(1).max(20),
  skills: z.array(skillExtractSchema).min(1).max(40),
});

/** 确认页提交 / GET 返回的完整档案 */
export const profileBodySchema = z
  .object({
    contact: contactSchema,
    headline: z.string().trim().min(1).max(80),
    summary: z.string().trim().min(1).max(600),
    experiences: z.array(experienceSchema).min(1).max(20),
    skills: z.array(skillSchema).min(1).max(40),
  })
  .superRefine((body, ctx) => {
    const factIds = new Set(body.experiences.flatMap((exp) => exp.facts.map((fact) => fact.id)));
    body.skills.forEach((skill, index) => {
      if (skill.level === 'expert' && skill.evidenceFactIds.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['skills', index, 'evidenceFactIds'],
          message: '标为深入的技能至少要关联一条事实',
        });
      }
      skill.evidenceFactIds.forEach((id, evidenceIndex) => {
        if (!factIds.has(id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['skills', index, 'evidenceFactIds', evidenceIndex],
            message: '证据必须是本档案中的事实',
          });
        }
      });
    });
  });

export const profileExtractRequestSchema = z.object({
  text: z.string().trim().min(10, '简历文本太短').max(50_000),
});

export type ProfileExtractOutput = z.infer<typeof profileExtractOutputSchema>;
export type ProfileBody = z.infer<typeof profileBodySchema>;
export type Fact = z.infer<typeof factSchema>;
export type Experience = z.infer<typeof experienceSchema>;
export type Skill = z.infer<typeof skillSchema>;
export type SkillLevel = z.infer<typeof skillLevelSchema>;
