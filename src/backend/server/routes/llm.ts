/**
 * @file 【后端·路由】模型连通检查
 * 接口：GET /api/llm/ping?alias=chat|judge|extract|fallback → core/llm.service.pingModel。
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { pingModel } from '@/backend/core/llm.service';
import { CHAT_ALIASES } from '@/shared/env/server';
import { rateLimit } from '../middleware/rate-limit';
import { toCtx, type AppEnv } from '../types';
import { validate } from '../validate';

const pingQuery = z.object({ alias: z.enum(CHAT_ALIASES).default('chat') });

export const llmRoutes = () =>
  new Hono<AppEnv>().get(
    '/ping',
    rateLimit({ windowMs: 60_000, max: 20 }),
    validate('query', pingQuery),
    async (c) => c.json(await pingModel(toCtx(c), c.req.valid('query').alias)),
  );
