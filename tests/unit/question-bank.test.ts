/**
 * @file 【单元测试】初版题库覆盖
 * 不连数据库。校验 JSONL 能被 questionSeedSchema 接受，并且每个技能标签都有够用的题。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { questionSeedSchema } from '@/shared/schemas/question';
import { SKILL_TAG_VALUES } from '@/shared/schemas/skill-tags';

const file = path.resolve(import.meta.dirname, '../../db/seeds/questions/frontend.jsonl');

describe('question bank', () => {
  const seeds = readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => questionSeedSchema.parse(JSON.parse(line)));

  it('至少 200 题，id 不重复，来源是自写', () => {
    expect(seeds.length).toBeGreaterThanOrEqual(200);
    expect(new Set(seeds.map((seed) => seed.id)).size).toBe(seeds.length);
    expect(seeds.every((seed) => seed.source === 'original' && seed.license === 'internal-original')).toBe(
      true,
    );
  });

  it('每个技能标签至少 8 题，并且同时有难度 1 和 5', () => {
    for (const tag of SKILL_TAG_VALUES) {
      const rows = seeds.filter((seed) => seed.skillTags.includes(tag));
      const levels = new Set(rows.map((seed) => seed.difficulty));
      expect(rows.length, tag).toBeGreaterThanOrEqual(8);
      expect(levels.has(1), tag).toBe(true);
      expect(levels.has(5), tag).toBe(true);
    }
  });

  it('不把受保护特征写进题目，也不出现标准答案字样', () => {
    const text = seeds.map((seed) => `${seed.content}\n${seed.answerPoints.join('\n')}`).join('\n');
    expect(text).not.toMatch(/标准答案|性别|婚育|民族|宗教/);
  });
});
