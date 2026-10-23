/**
 * @file 【后端·中间件】进程内存限流
 * 做什么：按 IP 的固定窗口计数（单实例够用），目前用于口令登录与模型 Ping 接口。
 */
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { AppError } from '@/shared/common/errors';
import type { AppEnv } from '../types';

export const clientIp = (c: Context): string =>
  c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'unknown';

/** 单进程内存固定窗口限流（个人使用够用；多实例时需换存储） */
export function createRateLimiter(opts: { windowMs: number; max: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    hit(key: string): boolean {
      const now = Date.now();
      const h = hits.get(key);
      if (!h || h.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + opts.windowMs });
        if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
        return true;
      }
      h.count += 1;
      return h.count <= opts.max;
    },
  };
}

export const rateLimit = (opts: { windowMs: number; max: number; key?: (c: Context<AppEnv>) => string }) => {
  const limiter = createRateLimiter(opts);
  return createMiddleware<AppEnv>(async (c, next) => {
    if (!limiter.hit(opts.key?.(c) ?? clientIp(c))) throw new AppError('RATE_LIMITED');
    await next();
  });
};
