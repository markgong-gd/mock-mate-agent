/**
 * @file 【后端·db】从 JSON 导入 Rubric
 * 读 db/seeds/rubrics/*.json，按 rubricSeedSchema 校验后 upsert。
 * active 只允许一个：导入时先把其它版本置为 false，避免库里出现两个“当前标准”。
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rubricSeedSchema, type RubricSeed } from '@/shared/schemas/rubric';
import { upsertRubrics } from './repos/diagnosis';

const SEED_DIR = fileURLToPath(new URL('../../../db/seeds/rubrics/', import.meta.url));

export async function loadRubricSeeds(dir = SEED_DIR): Promise<RubricSeed[]> {
  const files = (await readdir(dir)).filter((name) => name.endsWith('.json')).sort();
  const seeds: RubricSeed[] = [];
  for (const file of files) {
    const raw = await readFile(path.join(dir, file), 'utf8');
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (error) {
      throw new Error(`${file} 不是合法 JSON`, { cause: error });
    }
    const parsed = rubricSeedSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(
        `${file} ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('；')}`,
      );
    }
    const expected = `${parsed.data.definition.version}.json`;
    if (file !== expected) throw new Error(`${file} 的文件名要与版本号一致（应为 ${expected}）`);
    seeds.push(parsed.data);
  }
  return seeds;
}

export async function seedRubrics(): Promise<{ rubrics: number; active: string }> {
  const seeds = await loadRubricSeeds();
  if (seeds.length === 0) throw new Error('db/seeds/rubrics/ 下没有 Rubric');
  const active = seeds.filter((seed) => seed.active).map((seed) => seed.definition.version);
  if (active.length !== 1) throw new Error(`必须恰好有一个 active 的 Rubric，当前有 ${active.length} 个`);
  await upsertRubrics(seeds);
  return { rubrics: seeds.length, active: active[0]! };
}
