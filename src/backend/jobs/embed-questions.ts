/**
 * @file 【后端·jobs】embed-questions 队列
 * 题库是全局的，不按用户拆。handler 只调 core.embedQuestions。重复投递用 singletonKey 合并。
 */
import type { PgBoss } from 'pg-boss';
import { embedQuestions } from '@/backend/core/question-embed.service';

export const EMBED_QUESTIONS_QUEUE = 'embed-questions';

export async function registerEmbedQuestionsJob(boss: PgBoss) {
  await boss.createQueue(EMBED_QUESTIONS_QUEUE, { retryLimit: 3, retryDelay: 15 });
  await boss.work(EMBED_QUESTIONS_QUEUE, async (jobs) => {
    if (jobs.length > 0) await embedQuestions();
  });
}

export async function enqueueEmbedQuestions(boss: PgBoss) {
  await boss.send(EMBED_QUESTIONS_QUEUE, {}, { singletonKey: 'questions' });
}
