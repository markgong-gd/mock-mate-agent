/**
 * @file 【后端·db】数据库连接
 * 做什么：进程内唯一的 pg.Pool（Drizzle 与 LangGraph PostgresSaver 共用）、getDb()、pingDb()、closePool()。
 */
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { serverEnv } from '@/shared/env/server';
import { logger } from '@/shared/common/logger';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;

let pool: pg.Pool | undefined;
let db: Db | undefined;

/**
 * 进程内唯一连接池：Drizzle 与 PostgresSaver 共用；pg-boss 自建小连接池（共用连接串）。
 * 合计连接数控制在 10 以内（02 §12）。
 */
export function getPool(): pg.Pool {
  if (!pool) {
    const env = serverEnv();
    pool = new pg.Pool({
      connectionString: env.databaseUrl,
      max: env.dbPoolMax,
      application_name: 'mockmate',
    });
    pool.on('error', (err) => logger.error({ err }, 'pg pool error'));
  }
  return pool;
}

export function getDb(): Db {
  db ??= drizzle(getPool(), { schema });
  return db;
}

export async function closePool() {
  const p = pool;
  pool = undefined;
  db = undefined;
  await p?.end();
}

export async function pingDb(): Promise<void> {
  await getPool().query('select 1');
}

export { schema };
