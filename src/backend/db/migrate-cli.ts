/**
 * @file 【后端·db】迁移命令行入口（pnpm db:migrate）
 */
import '@/shared/env/load';
import { logger } from '@/shared/common/logger';
import { closePool } from './client';
import { runMigrations } from './migrate';

try {
  await runMigrations();
  await closePool();
} catch (err) {
  logger.error({ err }, 'db migration failed');
  await closePool();
  process.exit(1);
}
