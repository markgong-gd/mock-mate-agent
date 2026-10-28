/**
 * @file 【后端·路由】对话式简历策划
 * GET    /api/studio              最近的场次
 * POST   /api/studio              创建一场
 * DELETE /api/studio/:id          删除一场。对话和简历稿一起去掉
 * GET    /api/studio/:id          轮次和当前稿，退出后再进来靠它继续
 * GET    /api/studio/:id/export   打印页用的当前稿
 * POST   /api/studio/:id/chat     流式推进。空 message 表示开始或从失败节点续跑
 */
import { createUIMessageStreamResponse } from 'ai';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  createStudio,
  deleteStudio,
  exportStudio,
  getStudio,
  listStudios,
  streamStudioChat,
} from '@/backend/core/studio.service';
import { studioChatRequestSchema, studioCreateRequestSchema } from '@/shared/schemas/studio';
import { rateLimit } from '../middleware/rate-limit';
import { toCtx, type AppEnv } from '../types';
import { validate } from '../validate';

const idParam = z.object({ id: z.uuid() });

const SSE_HEADERS = { 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' };

export const studioRoutes = () =>
  new Hono<AppEnv>()
    .get('/', async (c) => c.json(await listStudios(toCtx(c))))
    .post(
      '/',
      rateLimit({ windowMs: 60_000, max: 20 }),
      validate('json', studioCreateRequestSchema),
      async (c) => c.json(await createStudio(toCtx(c), c.req.valid('json')), 201),
    )
    .post(
      '/:id/chat',
      rateLimit({ windowMs: 60_000, max: 40 }),
      validate('param', idParam),
      validate('json', studioChatRequestSchema),
      async (c) => {
        const body = c.req.valid('json');
        const stream = await streamStudioChat(toCtx(c), {
          sessionId: c.req.valid('param').id,
          message: body.message,
          ...(body.idempotencyKey ? { idempotencyKey: body.idempotencyKey } : {}),
          signal: c.req.raw.signal,
        });
        return createUIMessageStreamResponse({ stream, headers: SSE_HEADERS });
      },
    )
    .delete('/:id', validate('param', idParam), async (c) =>
      c.json(await deleteStudio(toCtx(c), c.req.valid('param').id)),
    )
    .get('/:id/export', validate('param', idParam), async (c) =>
      c.json(await exportStudio(toCtx(c), c.req.valid('param').id)),
    )
    .get('/:id', validate('param', idParam), async (c) =>
      c.json(await getStudio(toCtx(c), c.req.valid('param').id)),
    );
