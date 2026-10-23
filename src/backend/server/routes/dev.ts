/**
 * @file 【后端·路由】开发调试（ENABLE_DEV_ROUTES=true 时才开放，否则整组 404）
 * 接口：GET  /api/dev/echo/:threadId        从存档恢复回声图对话
 *       POST /api/dev/echo/:threadId/chat   推进一轮，返回 SSE（UI Message Stream）
 *       GET  /api/dev/threads/:id/state     查看 LangGraph 存档与历史 checkpoint
 *       GET  /api/dev/graphs/:name/mermaid  输出图结构 Mermaid
 */
import { createUIMessageStreamResponse } from 'ai';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { z } from 'zod';
import {
  DEV_GRAPH_NAMES,
  getEchoThread,
  getGraphMermaid,
  getThreadState,
  streamEchoTurn,
  type DevGraphName,
} from '@/backend/core/dev.service';
import { AppError } from '@/shared/common/errors';
import { toCtx, type AppEnv } from '../types';
import { validate } from '../validate';

const graphName = z.enum(DEV_GRAPH_NAMES as [DevGraphName, ...DevGraphName[]]);
const threadParam = z.object({ threadId: z.string().regex(/^[A-Za-z0-9:_-]{1,100}$/) });
const graphQuery = z.object({ graph: graphName.default('echo') });
const graphParam = z.object({ name: graphName });
const echoBody = z.object({ answer: z.string().max(4000).default('') });

/** 流式响应头：禁止代理缓冲（02 §4.2） */
export const SSE_HEADERS = { 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' };

/** 仅开发调试使用（ENABLE_DEV_ROUTES）；关闭时整组返回 404 */
export const devRoutes = (enabled: boolean) =>
  new Hono<AppEnv>()
    .use(
      createMiddleware<AppEnv>(async (_c, next) => {
        if (!enabled) throw new AppError('NOT_FOUND');
        await next();
      }),
    )
    .get(
      '/threads/:threadId/state',
      validate('param', threadParam),
      validate('query', graphQuery),
      async (c) => {
        const { threadId } = c.req.valid('param');
        const { graph } = c.req.valid('query');
        return c.json(await getThreadState(toCtx(c), graph, threadId));
      },
    )
    .get('/graphs/:name/mermaid', validate('param', graphParam), async (c) =>
      c.text(await getGraphMermaid(c.req.valid('param').name)),
    )
    .get('/echo/:threadId', validate('param', threadParam), async (c) =>
      c.json(await getEchoThread(toCtx(c), c.req.valid('param').threadId)),
    )
    .post('/echo/:threadId/chat', validate('param', threadParam), validate('json', echoBody), async (c) => {
      const stream = await streamEchoTurn(toCtx(c), {
        threadId: c.req.valid('param').threadId,
        answer: c.req.valid('json').answer,
        signal: c.req.raw.signal,
      });
      return createUIMessageStreamResponse({ stream, headers: SSE_HEADERS });
    });
