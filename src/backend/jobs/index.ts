/**
 * @file 【后端·jobs】后台任务注册入口
 * 做什么：registerJobs(boss) 注册全部 pg-boss 队列与 handler；由 core/runtime 在启动时调用。
 * 约定：handler 只调用 core，不直接写业务逻辑。
 */
import type { PgBoss } from 'pg-boss';
import { registerBackupJob } from './backup';

export interface JobsOptions {
  backup: { cron: string; enabled: boolean };
}

/** 注册全部 pg-boss 队列与 handler（handler 只调 core） */
export async function registerJobs(boss: PgBoss, opts: JobsOptions) {
  await registerBackupJob(boss, opts.backup);
}

export { BACKUP_QUEUE } from './backup';
