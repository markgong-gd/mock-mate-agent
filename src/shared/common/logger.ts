/**
 * @file 【公共·common】pino 日志（仅后端）
 * 约定：只记录 requestId、userIdHash、业务 id、耗时、状态等元数据，不记录简历 / 回答原文与明文 PII。
 * 兜底：约定靠人遵守，所以这里再加一道机器保障（P3-07）——
 *   hooks.logMethod 脱敏消息里的字符串，formatters.log 递归脱敏日志对象（含 err 的 message 与 stack）。
 *   redact.paths 仍负责按字段名盖掉密钥类字段。
 */
import { pino, type LoggerOptions, type Logger } from 'pino';
import { redactPii, redactPiiDeep } from './pii';

const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info');
const pretty = process.env.NODE_ENV !== 'production' && process.stdout.isTTY;

/** 单独导出，便于单测用同一套配置对着自定义 destination 验证脱敏是否真的生效 */
export const loggerOptions: LoggerOptions = {
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
  hooks: {
    // 只处理字符串入参（msg 与插值），对象留给 formatters.log，避免每条日志走两遍递归
    logMethod(args, method) {
      const redacted = args.map((arg) => (typeof arg === 'string' ? redactPii(arg).text : arg));
      method.apply(this, redacted as Parameters<typeof method>);
    },
  },
  formatters: {
    log: (obj) => redactPiiDeep(obj) as Record<string, unknown>,
  },
};

/**
 * 根 logger。约定：只记录 requestId、userIdHash、业务 id、耗时、状态等元数据；
 * 不记录简历原文、回答原文、模型正文与明文 PII（02 §9.2）。
 */
export const logger: Logger = pino({
  ...loggerOptions,
  ...(pretty ? { transport: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss.l' } } } : {}),
});

export type { Logger };
