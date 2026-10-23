/**
 * @file 【后端·中间件】requestId 与访问日志
 * 做什么：生成或透传 X-Request-Id，挂请求级 logger（c.var.log），请求结束记录方法/路径/状态/耗时（不含正文）。
 */
import { createMiddleware } from 'hono/factory';
import { newId } from '@/shared/common/ids';
import { logger } from '@/shared/common/logger';
import type { AppEnv } from '../types';

const VALID_ID = /^[A-Za-z0-9._-]{8,64}$/;

/** 生成 / 透传 requestId，挂 request 级 logger，并记录访问日志（不含正文） */
export const requestId = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    const incoming = c.req.header('x-request-id');
    const id = incoming && VALID_ID.test(incoming) ? incoming : newId();
    const log = logger.child({ requestId: id });
    c.set('requestId', id);
    c.set('log', log);
    c.header('X-Request-Id', id);
    const started = Date.now();
    await next();
    const path = c.req.path;
    if (path === '/api/healthz') return;
    const level = c.res.status >= 500 ? 'error' : path.startsWith('/api/') ? 'info' : 'debug';
    log[level]({ method: c.req.method, path, status: c.res.status, ms: Date.now() - started }, 'request');
  });
