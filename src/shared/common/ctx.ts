/**
 * @file 【公共·common】请求上下文 RequestCtx { userId, requestId }
 * 约定：身份在各层之间只通过它传递；core 及以下不读 Cookie / Header。
 */
/** 用例层上下文：身份只通过 ctx 传入，core 及以下不读 Cookie / Header */
export interface RequestCtx {
  userId: string;
  requestId: string;
}
