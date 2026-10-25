/**
 * @file 【后端·db】从 JSONL 导入题库
 * 读 db/seeds/questions/*.jsonl，按 questionSeedSchema 校验后 upsert。向量不在这里算。
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { questionSeedSchema, type QuestionSeed } from '@/shared/schemas/question';
import { upsertQuestions } from './repos/questions';

const SEED_DIR = fileURLToPath(new URL('../../../db/seeds/questions/', import.meta.url));

export async function loadQuestionSeeds(dir = SEED_DIR): Promise<QuestionSeed[]> {
  const files = (await readdir(dir)).filter((name) => name.endsWith('.jsonl')).sort();
  const seeds: QuestionSeed[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const raw = await readFile(path.join(dir, file), 'utf8');
    const lines = raw.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (!line) continue;
      let json: unknown;
      try {
        json = JSON.parse(line);
      } catch (error) {
        throw new Error(`${file}:${i + 1} 不是合法 JSON`, { cause: error });
      }
      const parsed = questionSeedSchema.safeParse(json);
      if (!parsed.success) {
        throw new Error(`${file}:${i + 1} ${parsed.error.issues.map((issue) => issue.message).join('；')}`);
      }
      if (seen.has(parsed.data.id)) throw new Error(`${file}:${i + 1} id 重复：${parsed.data.id}`);
      seen.add(parsed.data.id);
      seeds.push(parsed.data);
    }
  }
  return seeds;
}

export async function seedQuestionBank(): Promise<{ upserted: number }> {
  const seeds = await loadQuestionSeeds();
  if (seeds.length < 200) throw new Error(`题库只有 ${seeds.length} 题，初版至少 200`);
  return upsertQuestions(seeds);
}
