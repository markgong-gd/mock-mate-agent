/**
 * @file 【后端·jobs】embed-facts 队列
 * handler 只调 core.embedFactsForUser。保存档案后由 core 入队，同一用户用 singletonKey 合并重复任务。
 */
import type { PgBoss } from 'pg-boss';
import { embedFactsForUser } from '@/backend/core/embed.service';

export const EMBED_FACTS_QUEUE = 'embed-facts';

export interface EmbedFactsPayload {
  userId: string;
}

export async function registerEmbedFactsJob(boss: PgBoss) {
  await boss.createQueue(EMBED_FACTS_QUEUE, { retryLimit: 3, retryDelay: 15 });
  await boss.work<EmbedFactsPayload>(EMBED_FACTS_QUEUE, async (jobs) => {
    for (const job of jobs) {
      await embedFactsForUser(job.data.userId);
    }
  });
}

export async function enqueueEmbedFacts(boss: PgBoss, userId: string) {
  await boss.send(EMBED_FACTS_QUEUE, { userId }, { singletonKey: userId });
}
