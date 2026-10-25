/**
 * @file 【测试】技能别名识别：短词不误伤，中文别名可命中
 */
import { describe, expect, it } from 'vitest';
import { findSkillTags } from './skill-tags';

describe('findSkillTags', () => {
  it('认出 React 与性能，且 js 不会因为出现在 json 里命中 JavaScript', () => {
    const tags = findSkillTags('熟悉 React，做过首屏性能优化，接口返回 JSON');
    expect(tags.map((t) => t.tag)).toEqual(['react', 'performance']);
  });

  it('独立的 js 能命中 JavaScript', () => {
    expect(findSkillTags('日常用 js 写页面').map((t) => t.tag)).toContain('javascript');
  });
});
