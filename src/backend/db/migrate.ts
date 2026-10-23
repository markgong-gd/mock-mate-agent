/**
 * @file 【后端·db】执行迁移
 * 做什么：持有 pg advisory lock 后应用 db/migrations 下的 SQL，避免多实例 / 重启时并发迁移。
 */
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type pg from 'pg';
import { logger } from '@/shared/common/logger';
import { getPool } from './client';

const MIGRATION_LOCK_KEY = 'mockmate:migrate';

/** 持有 advisory lock 执行迁移，避免多实例 / 重启时并发迁移（02 §8.3） */
export async function runMigrations(pool: pg.Pool = getPool()) {
  const migrationsFolder = path.resolve(process.env.MIGRATIONS_DIR ?? 'db/migrations');
  const client = await pool.connect();
  const started = Date.now();
  try {
    await client.query('select pg_advisory_lock(hashtext($1))', [MIGRATION_LOCK_KEY]);
    await migrate(drizzle(client), { migrationsFolder });
    logger.info({ migrationsFolder, ms: Date.now() - started }, 'db migrations applied');
  } finally {
    await client
      .query('select pg_advisory_unlock(hashtext($1))', [MIGRATION_LOCK_KEY])
      .catch(() => undefined);
    client.release();
  }
}
