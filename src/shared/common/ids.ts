/**
 * @file 【公共·common】ID 工具（仅后端）
 * 做什么：newId() 生成 UUID；hashUserId() 生成不可逆哈希，日志中用它代替明文 userId。
 */
import { createHash, randomUUID } from 'node:crypto';

export const newId = (): string => randomUUID();

/** 日志中使用的用户标识：不可逆哈希，避免明文 userId */
export const hashUserId = (userId: string): string =>
  createHash('sha256').update(`mockmate:${userId}`).digest('hex').slice(0, 16);
