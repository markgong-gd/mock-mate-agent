/**
 * @file 【测试】抽取图：假模型输出能通过 Zod；注入的抽取函数能看到脱敏后的文本
 */
import { describe, expect, it } from 'vitest';
import { useTestEnv } from '../../../../tests/helpers/env';
import { buildJobExtractGraph, buildProfileExtractGraph } from './graph';

describe('extract graphs', () => {
  it('档案抽取图用假模型得到合法草稿，且不包含手机号', async () => {
    useTestEnv({ FAKE_LLM_DELAY_MS: '0' });
    const graph = buildProfileExtractGraph();
    const state = await graph.invoke({
      text: '联系方式 [PHONE]。负责 React 性能优化，把首屏从 4 秒降到 1 秒。',
      draft: null,
    });
    expect(state.draft?.skills.some((skill) => skill.tag === 'react')).toBe(true);
    expect(JSON.stringify(state.draft)).not.toContain('138');
  });

  it('JD 抽取图用假模型得到要求列表', async () => {
    useTestEnv({ FAKE_LLM_DELAY_MS: '0' });
    const graph = buildJobExtractGraph();
    const state = await graph.invoke({
      text: '高级前端工程师\n要求熟悉 TypeScript 与 React',
      draft: null,
    });
    expect(state.draft?.requirements.map((req) => req.tag)).toEqual(
      expect.arrayContaining(['react', 'typescript']),
    );
  });
});
