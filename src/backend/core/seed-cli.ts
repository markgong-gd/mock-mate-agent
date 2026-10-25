/**
 * @file 【后端·core】题库导入命令（pnpm db:seed）
 * 先 upsert，再把还没有向量的行补上。不启动 pg-boss，所以本机没开服务也能导入。
 */
import '@/shared/env/load';
import { closePool } from '@/backend/db/client';
import { seedQuestionBank } from '@/backend/db/seed-questions';
import { logger } from '@/shared/common/logger';
import { embedQuestions } from './question-embed.service';

try {
  const seeded = await seedQuestionBank();
  const embedded = await embedQuestions();
  logger.info({ ...seeded, ...embedded }, 'question bank ready');
  await closePool();
} catch (error) {
  logger.error({ err: error }, 'question seed failed');
  await closePool();
  process.exit(1);
}
