/**
 * @file 【后端·jobs】diagnose 队列
 * handler 只调 core.runDiagnosis。singletonKey 用 reportId：同一份报告重复投递只留一条。
 * 失败抛出交给 pg-boss 重试；重试次数用尽后报告停在 failed，用户可在报告页手动重试。
 */
import type { PgBoss } from 'pg-boss';
import { runDiagnosis, type DiagnoseRequest } from '@/backend/core/diagnosis.service';

export const DIAGNOSE_QUEUE = 'diagnose';

export async function registerDiagnoseJob(boss: PgBoss) {
  await boss.createQueue(DIAGNOSE_QUEUE, { retryLimit: 3, retryDelay: 30 });
  await boss.work<DiagnoseRequest>(DIAGNOSE_QUEUE, async (jobs) => {
    for (const job of jobs) await runDiagnosis(job.data);
  });
}

export async function enqueueDiagnose(boss: PgBoss, input: DiagnoseRequest) {
  await boss.send(DIAGNOSE_QUEUE, input, { singletonKey: input.reportId });
}
