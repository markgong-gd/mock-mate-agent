/**
 * @file 【后端·路由】职业档案
 * GET  /api/profile          已确认的档案，没有则 profile 为 null
 * PUT  /api/profile          确认页整份保存，并入队向量化
 * POST /api/profile/extract  抽取草稿，不落库。未同意返回 403
 */
import { Hono } from 'hono';
import { confirmProfile, extractProfile, readProfile } from '@/backend/core/profile.service';
import { profileBodySchema, profileExtractRequestSchema } from '@/shared/schemas/profile';
import { rateLimit } from '../middleware/rate-limit';
import { toCtx, type AppEnv } from '../types';
import { validate } from '../validate';

export const profileRoutes = () =>
  new Hono<AppEnv>()
    .get('/', async (c) => c.json(await readProfile(toCtx(c))))
    .put('/', validate('json', profileBodySchema), async (c) =>
      c.json(await confirmProfile(toCtx(c), c.req.valid('json'))),
    )
    .post(
      '/extract',
      rateLimit({ windowMs: 60_000, max: 10 }),
      validate('json', profileExtractRequestSchema),
      async (c) => c.json(await extractProfile(toCtx(c), c.req.valid('json').text)),
    );
