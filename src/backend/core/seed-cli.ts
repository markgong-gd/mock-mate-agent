/**
 * @file 【后端·core】种子数据导入命令（pnpm db:seed）
 * 先导入评分标准，再 upsert 题库，最后把还没有向量的题目补上。
 * 不启动 pg-boss，所以本机没开服务也能导入。
 */
import '@/shared/env/load';
import { closePool } from '@/backend/db/client';
import { seedQuestionBank } from '@/backend/db/seed-questions';
import { seedRubrics } from '@/backend/db/seed-rubrics';
import { logger } from '@/shared/common/logger';
import { embedQuestions } from './question-embed.service';

try {
  const rubrics = await seedRubrics();
  const seeded = await seedQuestionBank();
  const embedded = await embedQuestions();
  logger.info({ ...rubrics, ...seeded, ...embedded }, 'seed data ready');
  await closePool();
} catch (error) {
  logger.error({ err: error }, 'seed failed');
  await closePool();
  process.exit(1);
}
