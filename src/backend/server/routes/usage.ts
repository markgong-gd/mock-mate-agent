/**
 * @file 【后端·路由】单场用量与成本
 * GET /api/usage/sessions/:id   一场面试（含这场的诊断）的 Token、耗时与估算成本
 * 成本在 core 里按 agent/llm/pricing 现算，单价没配时返回 null（N-12、02 §5.6）。
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { getSessionUsage } from '@/backend/core/usage.service';
import { toCtx, type AppEnv } from '../types';
import { validate } from '../validate';

const idParam = z.object({ id: z.uuid() });

export const usageRoutes = () =>
  new Hono<AppEnv>().get('/sessions/:id', validate('param', idParam), async (c) =>
    c.json(await getSessionUsage(toCtx(c), c.req.valid('param').id)),
  );
