/**
 * @file 【后端·server】Hono 上下文类型
 * 做什么：AppEnv 声明 c.var 中的 requestId / userId / log；toCtx(c) 把 Hono 上下文转换为 RequestCtx。
 * 约定：路由调用 core 时只传 toCtx(c)，core 及以下不接触 Hono。
 */
import type { Context } from 'hono';
import type { RequestCtx } from '@/shared/common/ctx';
import type { Logger } from '@/shared/common/logger';

export interface AppEnv {
  Variables: {
    requestId: string;
    userId: string;
    log: Logger;
  };
}

export type AppContext = Context<AppEnv>;

/** 路由 → core：身份只经 ctx 传入 */
export const toCtx = (c: AppContext): RequestCtx => ({
  userId: c.get('userId'),
  requestId: c.get('requestId'),
});
