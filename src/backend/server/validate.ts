/**
 * @file 【后端·server】入参校验封装
 * 做什么：包装 @hono/zod-validator；校验失败统一抛 AppError("VALIDATION")，交给 error 中间件输出。
 */
import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { z } from 'zod';
import { AppError } from '@/shared/common/errors';

/** zod 校验失败统一抛 AppError(VALIDATION)，由错误中间件输出统一契约 */
export const validate = <Target extends keyof ValidationTargets, T extends z.ZodType>(
  target: Target,
  schema: T,
) =>
  zValidator(target, schema, (result) => {
    if (!result.success) {
      throw new AppError('VALIDATION', undefined, {
        details: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
  });
