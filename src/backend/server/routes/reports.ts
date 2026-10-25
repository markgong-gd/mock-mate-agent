/**
 * @file 【后端·路由】诊断报告
 * GET  /api/reports                最近的报告；带 ?sessionId= 时查某一场面试的那份
 * GET  /api/reports/:id            报告详情（含 Rubric、逐题点评、短板、复训计划）；pending 时前端轮询这个接口
 * POST /api/reports/:id/retry      最终失败后手动重试
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { getReportView, listReportSummaries, retryReport } from '@/backend/core/diagnosis.service';
import { reportListQuerySchema } from '@/shared/schemas/diagnosis';
import { rateLimit } from '../middleware/rate-limit';
import { toCtx, type AppEnv } from '../types';
import { validate } from '../validate';

const idParam = z.object({ id: z.uuid() });

export const reportRoutes = () =>
  new Hono<AppEnv>()
    .get('/', validate('query', reportListQuerySchema), async (c) =>
      c.json(await listReportSummaries(toCtx(c), c.req.valid('query'))),
    )
    .post('/:id/retry', rateLimit({ windowMs: 60_000, max: 10 }), validate('param', idParam), async (c) =>
      c.json(await retryReport(toCtx(c), c.req.valid('param').id)),
    )
    .get('/:id', validate('param', idParam), async (c) =>
      c.json(await getReportView(toCtx(c), c.req.valid('param').id)),
    );
