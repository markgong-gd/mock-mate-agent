/**
 * @file 【公共·common】错误码与统一错误契约（前后端共用）
 * 做什么：APP_ERROR_CODES（错误码 → HTTP 状态 / 是否可重试）、APP_ERROR_MESSAGES（文案）、AppError、ApiError。
 */
/**
 * 错误码与统一错误契约（docs/02-architecture.md §4.3、§9.3）。
 * 本文件前后端共用：不得引入任何 Node 专属依赖。
 */
export const APP_ERROR_CODES = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  BUDGET_EXCEEDED: 402,
  LLM_TIMEOUT: 503,
  LLM_UNAVAILABLE: 503,
  LLM_SCHEMA_INVALID: 502,
  INTERNAL: 500,
} as const;

export type AppErrorCode = keyof typeof APP_ERROR_CODES;

export const APP_ERROR_MESSAGES: Record<AppErrorCode, string> = {
  VALIDATION: '请求参数不合法',
  UNAUTHORIZED: '需要访问口令',
  FORBIDDEN: '无权访问',
  NOT_FOUND: '资源不存在',
  CONFLICT: '状态冲突，请刷新后重试',
  RATE_LIMITED: '请求过于频繁，请稍后再试',
  BUDGET_EXCEEDED: '额度已用尽',
  LLM_TIMEOUT: '模型响应超时，请稍后重试',
  LLM_UNAVAILABLE: '模型服务暂不可用，请稍后重试',
  LLM_SCHEMA_INVALID: '模型输出格式异常，请重试',
  INTERNAL: '服务器内部错误',
};

export interface ApiError {
  code: AppErrorCode;
  message: string;
  requestId: string;
  details?: unknown;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly details?: unknown;

  constructor(code: AppErrorCode, message?: string, options?: { details?: unknown; cause?: unknown }) {
    super(message ?? APP_ERROR_MESSAGES[code], { cause: options?.cause });
    this.name = 'AppError';
    this.code = code;
    this.details = options?.details;
  }

  get status(): number {
    return APP_ERROR_CODES[this.code];
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;

export const isApiError = (v: unknown): v is ApiError =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as ApiError).code === 'string' &&
  (v as ApiError).code in APP_ERROR_CODES &&
  typeof (v as ApiError).requestId === 'string';
