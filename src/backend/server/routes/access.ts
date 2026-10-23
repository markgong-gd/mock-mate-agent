/**
 * @file 【后端·路由】访问口令
 * 接口：GET /api/access/status、POST /api/access/login（限流）、POST /api/access/logout。
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { AppError } from '@/shared/common/errors';
import {
  accessGate,
  grantAccess,
  hasAccess,
  isGateEnabled,
  passwordMatches,
  revokeAccess,
  type AccessGateOptions,
} from '../middleware/access-gate';
import { rateLimit } from '../middleware/rate-limit';
import type { AppEnv } from '../types';
import { validate } from '../validate';

const loginBody = z.object({ password: z.string().min(1).max(200) });

export { accessGate };

export const accessRoutes = (o: AccessGateOptions) =>
  new Hono<AppEnv>()
    .get('/status', async (c) => c.json({ enabled: isGateEnabled(o), granted: await hasAccess(c, o) }))
    .post('/login', rateLimit({ windowMs: 10 * 60_000, max: 10 }), validate('json', loginBody), async (c) => {
      if (!isGateEnabled(o)) return c.json({ ok: true as const });
      if (!passwordMatches(c.req.valid('json').password, o.password))
        throw new AppError('UNAUTHORIZED', '口令错误');
      await grantAccess(c, o);
      return c.json({ ok: true as const });
    })
    .post('/logout', (c) => {
      revokeAccess(c, o);
      return c.json({ ok: true as const });
    });
