/**
 * @file 【后端·中间件】统一错误出口
 * 做什么：把 AppError / HTTPException / 未知异常统一转换为 { code, message, requestId, details? }；
 *        未知异常对外只给通用文案，细节只进日志。另提供 404 处理。
 */
import type { ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import {
  APP_ERROR_CODES,
  APP_ERROR_MESSAGES,
  isAppError,
  type ApiError,
  type AppErrorCode,
} from '@/shared/common/errors';
import { logger } from '@/shared/common/logger';
import type { AppEnv } from '../types';

const STATUS_TO_CODE: Record<number, AppErrorCode> = {
  400: 'VALIDATION',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'VALIDATION',
  429: 'RATE_LIMITED',
};

/** 统一错误契约 { code, message, requestId, details? }（02 §4.3） */
export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  const requestId = c.get('requestId') ?? 'unknown';
  const log = c.get('log') ?? logger;
  let body: ApiError;
  let status: number;

  if (isAppError(err)) {
    status = err.status;
    body = {
      code: err.code,
      message: err.message,
      requestId,
      ...(err.details !== undefined && { details: err.details }),
    };
    if (status >= 500) log.error({ err, code: err.code }, 'request failed');
    else log.warn({ code: err.code, msg: err.message }, 'request rejected');
  } else if (err instanceof HTTPException) {
    status = err.status;
    const code = STATUS_TO_CODE[status] ?? 'INTERNAL';
    body = { code, message: APP_ERROR_MESSAGES[code], requestId };
    if (status >= 500) log.error({ err }, 'request failed');
  } else {
    status = 500;
    body = { code: 'INTERNAL', message: APP_ERROR_MESSAGES.INTERNAL, requestId };
    log.error({ err }, 'unhandled error');
  }
  return c.json(body, status as ContentfulStatusCode);
};

export const notFoundHandler: NotFoundHandler<AppEnv> = (c) =>
  c.json<ApiError>(
    { code: 'NOT_FOUND', message: APP_ERROR_MESSAGES.NOT_FOUND, requestId: c.get('requestId') ?? 'unknown' },
    APP_ERROR_CODES.NOT_FOUND,
  );
