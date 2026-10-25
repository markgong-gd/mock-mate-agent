/**
 * @file 【后端·路由】目标岗位
 * POST /api/jobs      解析 JD，返回岗位和要求的匹配度
 * GET  /api/jobs      列表
 * GET  /api/jobs/:id  单个岗位和当前匹配度
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { createJob, listJobViews, readJob } from '@/backend/core/job.service';
import { jobCreateRequestSchema } from '@/shared/schemas/job';
import { rateLimit } from '../middleware/rate-limit';
import { toCtx, type AppEnv } from '../types';
import { validate } from '../validate';

export const jobRoutes = () =>
  new Hono<AppEnv>()
    .get('/', async (c) => c.json(await listJobViews(toCtx(c))))
    .post(
      '/',
      rateLimit({ windowMs: 60_000, max: 20 }),
      validate('json', jobCreateRequestSchema),
      async (c) => c.json(await createJob(toCtx(c), c.req.valid('json').jdText)),
    )
    .get('/:id', validate('param', z.object({ id: z.uuid() })), async (c) =>
      c.json(await readJob(toCtx(c), c.req.valid('param').id)),
    );
