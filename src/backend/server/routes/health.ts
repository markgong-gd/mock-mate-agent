/**
 * @file 【后端·路由】健康检查
 * 接口：GET /api/healthz（进程存活）、GET /api/readyz（含 DB 检查，失败返回 503）。
 */
import { Hono } from 'hono';
import { checkReady } from '@/backend/core/health.service';
import type { AppEnv } from '../types';

const bootedAt = Date.now();

export const healthRoutes = () =>
  new Hono<AppEnv>()
    .get('/healthz', (c) =>
      c.json({ ok: true as const, uptimeS: Math.round((Date.now() - bootedAt) / 1000) }),
    )
    .get('/readyz', async (c) => {
      const r = await checkReady();
      return c.json(r, r.ok ? 200 : 503);
    });
