/**
 * @file 【后端·core】就绪检查用例
 * 做什么：checkReady 检查数据库是否可用，供 /api/readyz 使用。
 */
import { pingDb } from '@/backend/db/client';

export interface ReadyResult {
  ok: boolean;
  checks: Record<string, { ok: boolean; ms: number; error?: string }>;
}

/** 就绪检查：DB 可连（02 §9.3） */
export async function checkReady(): Promise<ReadyResult> {
  const started = Date.now();
  try {
    await pingDb();
    return { ok: true, checks: { db: { ok: true, ms: Date.now() - started } } };
  } catch (e) {
    return {
      ok: false,
      checks: { db: { ok: false, ms: Date.now() - started, error: (e as Error).message.slice(0, 200) } },
    };
  }
}
