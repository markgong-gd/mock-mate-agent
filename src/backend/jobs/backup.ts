/**
 * @file 【后端·jobs】backup 队列：按 BACKUP_CRON 定时执行 core/backup.service.runBackup
 */
import type { PgBoss } from 'pg-boss';
import { runBackup } from '@/backend/core/backup.service';

export const BACKUP_QUEUE = 'backup';

/** 每日 pg_dump 备份；handler 只调 core */
export async function registerBackupJob(boss: PgBoss, opts: { cron: string; enabled: boolean }) {
  await boss.createQueue(BACKUP_QUEUE, { retryLimit: 2, retryDelay: 60 });
  await boss.work(BACKUP_QUEUE, async () => {
    await runBackup();
  });
  if (opts.enabled) await boss.schedule(BACKUP_QUEUE, opts.cron);
  else await boss.unschedule(BACKUP_QUEUE).catch(() => undefined);
}
