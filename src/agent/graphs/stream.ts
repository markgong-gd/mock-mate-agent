/**
 * @file 【智能体·graphs】图输出 → 前端协议的翻译器
 * 做什么：graphToUIStream 把 LangGraph 流（messages / custom / values）转换为 AI SDK UI Message Stream：
 *        文本逐 token → text-delta；节点内 config.writer() 事件 → data-xxx；结尾追加 data-metrics；错误统一编码。
 */
import { toUIMessageStream } from '@ai-sdk/langchain';
import { createUIMessageStream, type UIMessageChunk, type UIMessageStreamWriter } from 'ai';
import { APP_ERROR_MESSAGES, AppError, isAppError, type AppErrorCode } from '@/shared/common/errors';
import { logger } from '@/shared/common/logger';

export interface StreamMetrics {
  firstTokenMs: number | null;
  totalMs: number;
}

export interface GraphUIStreamOptions<TState> {
  /** 计时起点（默认为调用本函数的时刻） */
  startedAt?: number;
  /** 图开始输出前写入的自定义 data part（如当前进度） */
  prelude?: (writer: UIMessageStreamWriter) => void;
  onFinish?: (info: StreamMetrics & { finalState?: TState }) => void | Promise<void>;
  logContext?: Record<string, unknown>;
}

/** 流内错误统一编码为 JSON 字符串 { code, message }，前端按 code 决定文案与是否重试（02 §4.3） */
export function encodeStreamError(e: unknown): string {
  const code = classifyStreamError(e);
  return JSON.stringify({ code, message: APP_ERROR_MESSAGES[code] });
}

function classifyStreamError(e: unknown): AppErrorCode {
  if (isAppError(e)) return e.code;
  if (e instanceof Error) {
    if (e.name === 'AbortError' || e.name === 'TimeoutError' || /timed? ?out/i.test(e.message))
      return 'LLM_TIMEOUT';
    const status = (e as { status?: unknown }).status;
    if (
      typeof status === 'number' ||
      /API|Connection|RateLimit|fetch failed/i.test(`${e.name} ${e.message}`)
    ) {
      return 'LLM_UNAVAILABLE';
    }
  }
  return 'INTERNAL';
}

/**
 * LangGraph 流 → AI SDK UI Message Stream（02 §4.2，流式适配方案见 02 §1.3）。
 * - 文本：`streamMode: "messages"` 逐 token 转 text-delta
 * - 自定义事件：节点内 `config.writer({ type: 'xxx', ... })` → `data-xxx`（transient）
 * - 结尾追加 `data-metrics`（首字延迟 / 总耗时），错误替换为统一错误编码
 */
export function graphToUIStream<TState = unknown>(
  graphStream: ReadableStream | AsyncIterable<unknown>,
  opts: GraphUIStreamOptions<TState> = {},
): ReadableStream<UIMessageChunk> {
  const startedAt = opts.startedAt ?? Date.now();
  let firstTokenMs: number | null = null;
  let lastError: unknown;
  let finalState: TState | undefined;

  const source = toUIMessageStream<TState>(graphStream as ReadableStream, {
    sendStart: false,
    sendFinish: false,
    onToken: () => {
      firstTokenMs ??= Date.now() - startedAt;
    },
    onFinish: (state) => {
      finalState = state;
    },
    onError: (e) => {
      lastError = e;
    },
  });

  const post = new TransformStream<UIMessageChunk, UIMessageChunk>({
    transform(chunk, controller) {
      if (chunk.type === 'error') {
        controller.enqueue({
          type: 'error',
          errorText: encodeStreamError(lastError ?? new AppError('INTERNAL')),
        });
        logger.error({ ...opts.logContext, err: lastError }, 'graph stream failed');
        return;
      }
      controller.enqueue(chunk);
    },
    async flush(controller) {
      const metrics: StreamMetrics = { firstTokenMs, totalMs: Date.now() - startedAt };
      controller.enqueue({ type: 'data-metrics', data: metrics, transient: true });
      controller.enqueue({ type: 'finish' });
      logger.info(
        { ...opts.logContext, ...metrics, failed: lastError !== undefined },
        'graph stream finished',
      );
      await opts.onFinish?.({ ...metrics, finalState });
    },
  });

  return createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: 'start' });
      opts.prelude?.(writer);
      writer.merge(source.pipeThrough(post));
    },
    onError: encodeStreamError,
  });
}
