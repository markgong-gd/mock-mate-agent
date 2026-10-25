/**
 * @file 【智能体·rubrics】Rubric → 提示词文本
 * 定义本身是数据：源头在 db/seeds/rubrics/*.json，运行时从 rubrics 表读（按报告记录的版本）。
 * 这一层只做“定义翻成提示词里的几行字”，不碰数据库，也不调模型，所以换 Rubric 不会牵动图。
 */
import type { RubricDefinition } from '@/shared/schemas/rubric';

/** 维度 key 列表，写进 Prompt 的 DIMENSIONS 块，约束模型只输出这些 key */
export function rubricDimensionKeys(rubric: RubricDefinition): string[] {
  return rubric.dimensions.map((d) => d.key);
}

/** 每个维度一行：key（名称）：说明。锚点：1=… 3=… */
export function rubricPromptText(rubric: RubricDefinition): string {
  return rubric.dimensions
    .map((d) => {
      const anchors = d.anchors.map((a) => `${a.score}=${a.text}`).join('；');
      return `- ${d.key}（${d.label}）：${d.description} 锚点：${anchors}`;
    })
    .join('\n');
}
