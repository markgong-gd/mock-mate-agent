/**
 * @file 【智能体·tools】历史短板（只读）
 * 做什么：读出这个用户"还没解决"的短板（open + improving），按 tag 去重、严重度高的在前。
 * 关键约定：**userId 只从 config.configurable 取**，不做成模型可见的参数。
 *   身份一旦出现在工具入参里，Prompt 注入就能越权读别人的数据（02 §6.3、N-6）。
 * 谁在用：interview 图的 plan_questions（优先针对短板出题，R-C2-4）。
 *   openWeaknessesTool 是同一份逻辑的 LangChain 工具包装，留给以后让模型自己调（含 B-05 的 MCP）。
 */
import { tool } from '@langchain/core/tools';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { z } from 'zod';
import { listUserWeaknesses } from '@/backend/db/repos/diagnosis';
import { getGraphCtx } from '@/agent/graphs/config';
import { openWeaknesses, type MergedWeakness } from '@/shared/domain/weakness/merge';
import { skillLabel } from '@/shared/schemas/skill-tags';

export const OPEN_WEAKNESS_LIMIT = 4;

/** 图节点直接调用的版本：拿到的是结构化结果 */
export async function getOpenWeaknesses(
  config: LangGraphRunnableConfig,
  opts: { limit?: number } = {},
): Promise<MergedWeakness[]> {
  const { userId } = getGraphCtx(config);
  const rows = await listUserWeaknesses(userId);
  return openWeaknesses(rows).slice(0, opts.limit ?? OPEN_WEAKNESS_LIMIT);
}

/** 模型可调用的版本：只回文本，且仍然从 config 取身份 */
export const openWeaknessesTool = tool(
  async (input: { limit?: number }, config: LangGraphRunnableConfig) => {
    const items = await getOpenWeaknesses(config, { limit: input.limit ?? OPEN_WEAKNESS_LIMIT });
    if (items.length === 0) return '这位候选人目前没有未解决的短板记录。';
    return items
      .map(
        (item) =>
          `- [${item.tag}] ${skillLabel(item.tag)}｜严重度 ${item.severity}｜状态 ${item.status}｜出现 ${item.occurrences} 次：${item.title}`,
      )
      .join('\n');
  },
  {
    name: 'get_open_weaknesses',
    description: '读取当前候选人尚未解决的面试短板（技能标签、严重度、出现次数）。不接受用户 id 参数。',
    schema: z.object({
      limit: z.number().int().min(1).max(10).optional().describe('最多返回几条，默认 4'),
    }),
  },
);
