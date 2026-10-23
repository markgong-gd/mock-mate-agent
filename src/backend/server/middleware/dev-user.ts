/**
 * @file 【后端·中间件】单用户模式身份注入
 * 做什么：当前无正式登录，把固定的 DEV_USER_ID 写入 c.var.userId。
 * 未来：正式鉴权上线时替换为 auth 中间件，下游 ctx 结构不变。
 */
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types';

/**
 * 当前无正式鉴权：注入固定用户（DEV_USER_ID）。
 * 正式鉴权（03 B-01）上线时由 auth 中间件替换，ctx 结构不变。
 */
export const devUser = (userId: string) =>
  createMiddleware<AppEnv>(async (c, next) => {
    c.set('userId', userId);
    await next();
  });
