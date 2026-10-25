/**
 * @file 【后端·路由】专项训练
 * POST /api/training   针对报告里的一条短板开一场 kind = 'drill' 的面试，返回会话摘要
 * 之后的问答、结束、诊断都走 /api/interviews 的那套接口，不另开一条链路（R-C2-5）。
 */
import { Hono } from 'hono';
import { createTraining } from '@/backend/core/training.service';
import { trainingCreateRequestSchema } from '@/shared/schemas/interview';
import { rateLimit } from '../middleware/rate-limit';
import { toCtx, type AppEnv } from '../types';
import { validate } from '../validate';

export const trainingRoutes = () =>
  new Hono<AppEnv>().post(
    '/',
    rateLimit({ windowMs: 60_000, max: 20 }),
    validate('json', trainingCreateRequestSchema),
    async (c) => c.json(await createTraining(toCtx(c), c.req.valid('json')), 201),
  );
