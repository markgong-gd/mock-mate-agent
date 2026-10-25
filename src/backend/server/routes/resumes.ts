/**
 * @file 【后端·路由】定制简历
 * POST /api/resumes/generate     流式生成。正文是一份越来越完整的 JSON，给 useObject 用
 * GET  /api/resumes              列表，可用 ?jobId= 过滤
 * GET  /api/resumes/:id          某一版，含未溯源条目也能读，方便修改
 * PUT  /api/resumes/:id          编辑。asNewVersion 为真时另存
 * GET  /api/resumes/:id/export   打印数据。含 unverified 时 409
 */
import { Hono } from 'hono';
import { z } from 'zod';
import {
  editResume,
  exportResume,
  listResumeViews,
  readResume,
  streamResume,
} from '@/backend/core/resume.service';
import { resumeGenerateRequestSchema, resumeUpdateSchema } from '@/shared/schemas/resume';
import { rateLimit } from '../middleware/rate-limit';
import { toCtx, type AppEnv } from '../types';
import { validate } from '../validate';

const idParam = z.object({ id: z.uuid() });
const listQuery = z.object({ jobId: z.uuid().optional() });

export const resumeRoutes = () =>
  new Hono<AppEnv>()
    .get('/', validate('query', listQuery), async (c) =>
      c.json(await listResumeViews(toCtx(c), c.req.valid('query').jobId)),
    )
    .post(
      '/generate',
      rateLimit({ windowMs: 60_000, max: 10 }),
      validate('json', resumeGenerateRequestSchema),
      async (c) => {
        const stream = await streamResume(toCtx(c), c.req.valid('json').jobId, c.req.raw.signal);
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'X-Accel-Buffering': 'no',
          },
        });
      },
    )
    .get('/:id/export', validate('param', idParam), async (c) =>
      c.json(await exportResume(toCtx(c), c.req.valid('param').id)),
    )
    .get('/:id', validate('param', idParam), async (c) => c.json(await readResume(toCtx(c), c.req.valid('param').id)))
    .put('/:id', validate('param', idParam), validate('json', resumeUpdateSchema), async (c) =>
      c.json(await editResume(toCtx(c), c.req.valid('param').id, c.req.valid('json'))),
    );
