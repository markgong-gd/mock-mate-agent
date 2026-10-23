/**
 * @file 【后端·core】数据库备份用例
 * 做什么：pg_dump（custom 格式）写入 BACKUP_DIR，只保留最近 BACKUP_KEEP 份；由 jobs/backup 定时调用。
 */
import { spawn } from 'node:child_process';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { serverEnv } from '@/shared/env/server';
import { logger } from '@/shared/common/logger';

const PREFIX = 'mockmate-';
const SUFFIX = '.dump';

function runPgDump(databaseUrl: string, file: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(
      'pg_dump',
      ['--format=custom', '--no-owner', `--file=${file}`, `--dbname=${databaseUrl}`],
      {
        stdio: ['ignore', 'ignore', 'pipe'],
      },
    );
    let stderr = '';
    p.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    p.on('error', reject);
    p.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`pg_dump exited with ${code}: ${stderr.slice(0, 300)}`)),
    );
  });
}

/** 每日备份：pg_dump（custom 格式）写入 BACKUP_DIR，只保留最近 BACKUP_KEEP 份 */
export async function runBackup(): Promise<{ file: string; bytes: number; removed: string[] } | null> {
  const env = serverEnv();
  const dir = env.backup.dir;
  if (!dir) {
    logger.warn('BACKUP_DIR 未配置，跳过备份');
    return null;
  }
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `${PREFIX}${stamp}${SUFFIX}`);
  const started = Date.now();
  await runPgDump(env.databaseUrl, file);
  const { size } = await stat(file);

  const all = (await readdir(dir)).filter((f) => f.startsWith(PREFIX) && f.endsWith(SUFFIX)).sort();
  const removed = all.slice(0, Math.max(0, all.length - env.backup.keep));
  await Promise.all(removed.map((f) => rm(path.join(dir, f), { force: true })));

  logger.info({ file, bytes: size, removed: removed.length, ms: Date.now() - started }, 'backup done');
  return { file, bytes: size, removed };
}
