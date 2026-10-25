/**
 * @file 【公共·schemas】题库种子格式（P1 只定义格式，P2a 才建表、导入）
 * 字段与 02 §7.1 对应。skillTags 必须来自 skill-tags 目录，这样 JD 要求和题目用的是同一套标签。
 */
import { z } from 'zod';
import { skillTagSchema } from './skill-tags';

export const QUESTION_TYPES = ['concept', 'scenario', 'project', 'behavior'] as const;

export const questionSeedSchema = z.object({
  /** 稳定 id，重复导入时 upsert。建议 `fe-react-001` 这种可读形式 */
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'id 只用小写字母、数字和连字符'),
  content: z.string().trim().min(1).max(2000),
  /** 参考要点，给评估用，不直接展示为“标准答案” */
  answerPoints: z.array(z.string().trim().min(1)).min(1).max(8),
  skillTags: z.array(skillTagSchema).min(1),
  /** 1 识记 … 5 设计与权衡，见 db/seeds/questions/README.md */
  difficulty: z.number().int().min(1).max(5),
  type: z.enum(QUESTION_TYPES),
  source: z.string().trim().min(1).max(200),
  license: z.string().trim().min(1).max(80),
  /** 关键词召回用的拼接文本；缺省时 P2a 导入脚本用 content + answerPoints 生成 */
  searchText: z.string().trim().min(1).max(4000).optional(),
});

export type QuestionSeed = z.infer<typeof questionSeedSchema>;
