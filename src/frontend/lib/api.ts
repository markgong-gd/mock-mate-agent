/**
 * @file 【前端·基础】类型安全的后端客户端
 * 做什么：hc<AppType> 生成客户端（只 import type，不打包后端代码）；
 *        unwrap() 解包响应并在失败时抛 ApiClientError；parseStreamError() 解析流内错误 { code, message }。
 * 怎么工作：前端所有普通请求都经过这里；错误码定义来自 shared/common/errors.ts（前后端共用）。
 */
import { hc, type ClientResponse } from 'hono/client';
import type { AppType } from '@/backend/server/app';
import { APP_ERROR_MESSAGES, isApiError, type ApiError, type AppErrorCode } from '@/shared/common/errors';

/** 类型安全客户端：只 import 后端类型（02 §4.1） */
export const client = hc<AppType>('/', { init: { credentials: 'same-origin' } });
export const api = client.api;

export class ApiClientError extends Error {
  readonly code: AppErrorCode;
  readonly requestId?: string;
  readonly details?: unknown;
  readonly status: number;

  constructor(body: Partial<ApiError> & { code: AppErrorCode }, status: number) {
    super(body.message ?? APP_ERROR_MESSAGES[body.code]);
    this.name = 'ApiClientError';
    this.code = body.code;
    this.requestId = body.requestId;
    this.details = body.details;
    this.status = status;
  }

  /** 可重试的错误（按错误码决定，02 §9.3） */
  get retryable(): boolean {
    return ['RATE_LIMITED', 'LLM_TIMEOUT', 'LLM_UNAVAILABLE', 'LLM_SCHEMA_INVALID', 'INTERNAL'].includes(
      this.code,
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyResponse = ClientResponse<any, any, any>;
type OkBody<R> =
  R extends ClientResponse<infer T, infer S, 'json'> ? (S extends 200 | 201 ? T : never) : never;

/** 401 时刷新页面，由服务端口令页接管 */
function handleUnauthorized(code: AppErrorCode) {
  if (code === 'UNAUTHORIZED' && typeof window !== 'undefined') window.location.reload();
}

/** 解包 hc 响应：成功返回 2xx 的 JSON 类型；失败抛 ApiClientError */
export async function unwrap<R extends AnyResponse>(p: Promise<R> | R): Promise<OkBody<R>> {
  const res = await p;
  if (res.ok) return (await res.json()) as OkBody<R>;
  const body: unknown = await res.json().catch(() => null);
  if (isApiError(body)) {
    handleUnauthorized(body.code);
    throw new ApiClientError(body, res.status);
  }
  throw new ApiClientError({ code: res.status === 404 ? 'NOT_FOUND' : 'INTERNAL' }, res.status);
}

/** 流内错误：服务端 errorText 为 JSON { code, message } */
export function parseStreamError(
  err: Error | undefined,
): { code: AppErrorCode; message: string } | undefined {
  if (!err) return undefined;
  try {
    const v = JSON.parse(err.message) as { code?: string; message?: string };
    if (v.code && v.code in APP_ERROR_MESSAGES) {
      const code = v.code as AppErrorCode;
      return { code, message: v.message ?? APP_ERROR_MESSAGES[code] };
    }
  } catch {
    /* 非 JSON：网络错误或 HTTP 错误 */
  }
  const http = /"code":"([A-Z_]+)"/.exec(err.message)?.[1];
  if (http && http in APP_ERROR_MESSAGES) {
    const code = http as AppErrorCode;
    handleUnauthorized(code);
    return { code, message: APP_ERROR_MESSAGES[code] };
  }
  return { code: 'INTERNAL', message: '网络异常，请稍后重试' };
}
