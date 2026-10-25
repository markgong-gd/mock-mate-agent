/**
 * @file 【后端·路由】文字面试
 * GET  /api/interviews           最近的场次
 * POST /api/interviews           创建一场，返回 id。第一题由对话页再调 chat 拉起
 * GET  /api/interviews/:id       轮次和进度，刷新后靠它恢复
 * POST /api/interviews/:id/chat  流式推进。空 answer 表示开始或从失败节点续跑
 * POST /api/interviews/:id/finish  用户主动结束
 */
import { createUIMessageStreamResponse } from 'ai';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  createInterview,
  finishInterview,
  getInterview,
  listInterviews,
  streamInterviewChat,
} from '@/backend/core/interview.service';
import { interviewChatRequestSchema, interviewCreateRequestSchema } from '@/shared/schemas/interview';
import { rateLimit } from '../middleware/rate-limit';
import { toCtx, type AppEnv } from '../types';
import { validate } from '../validate';

const idParam = z.object({ id: z.uuid() });

const SSE_HEADERS = { 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' };

export const interviewRoutes = () =>
  new Hono<AppEnv>()
    .get('/', async (c) => c.json(await listInterviews(toCtx(c))))
    .post(
      '/',
      rateLimit({ windowMs: 60_000, max: 20 }),
      validate('json', interviewCreateRequestSchema),
      async (c) => c.json(await createInterview(toCtx(c), c.req.valid('json')), 201),
    )
    .post(
      '/:id/chat',
      rateLimit({ windowMs: 60_000, max: 40 }),
      validate('param', idParam),
      validate('json', interviewChatRequestSchema),
      async (c) => {
        const body = c.req.valid('json');
        const stream = await streamInterviewChat(toCtx(c), {
          sessionId: c.req.valid('param').id,
          answer: body.answer,
          ...(body.idempotencyKey ? { idempotencyKey: body.idempotencyKey } : {}),
          signal: c.req.raw.signal,
        });
        return createUIMessageStreamResponse({ stream, headers: SSE_HEADERS });
      },
    )
    .post('/:id/finish', validate('param', idParam), async (c) =>
      c.json(await finishInterview(toCtx(c), c.req.valid('param').id)),
    )
    .get('/:id', validate('param', idParam), async (c) =>
      c.json(await getInterview(toCtx(c), c.req.valid('param').id)),
    );
