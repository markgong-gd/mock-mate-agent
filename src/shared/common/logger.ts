/**
 * @file 【公共·common】pino 日志（仅后端）
 * 约定：只记录 requestId、userIdHash、业务 id、耗时、状态等元数据，不记录简历 / 回答原文与明文 PII。
 */
import { pino, type Logger } from 'pino';

const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info');
const pretty = process.env.NODE_ENV !== 'production' && process.stdout.isTTY;

/**
 * 根 logger。约定：只记录 requestId、userIdHash、业务 id、耗时、状态等元数据；
 * 不记录简历原文、回答原文、模型正文与明文 PII（02 §9.2）。
 */
export const logger: Logger = pino({
  level,
  base: undefined,
  redact: {
    paths: [
      'password',
      '*.password',
      'apiKey',
      '*.apiKey',
      'authorization',
      '*.authorization',
      'cookie',
      '*.cookie',
    ],
    censor: '[REDACTED]',
  },
  ...(pretty ? { transport: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss.l' } } } : {}),
});

export type { Logger };
