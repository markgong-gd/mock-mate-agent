/**
 * @file 【智能体·llm】离线假模型（provider kind = fake）
 * 做什么：无需 API Key 即可跑通全链路。Prompt 含 TASK 标记时返回结构化 JSON，否则保持回声问答。
 */
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { BaseChatModel, type BaseChatModelParams } from '@langchain/core/language_models/chat_models';
import { AIMessage, AIMessageChunk, type BaseMessage } from '@langchain/core/messages';
import { ChatGenerationChunk, type ChatResult } from '@langchain/core/outputs';
import { fakeStructuredReply } from './fake-structured';

const QUESTIONS = [
  '请先做一个简短的自我介绍。',
  '说说你最近做过的一个项目，你在其中负责什么？',
  '在这个项目里，你遇到的最大技术难点是什么？怎么解决的？',
  '如果重新做一次，你会在哪些方面改进？',
];

const textOf = (m: BaseMessage): string =>
  typeof m.content === 'string'
    ? m.content
    : m.content
        .map((p) => (typeof p === 'object' && 'text' in p && typeof p.text === 'string' ? p.text : ''))
        .join('');

const estimateTokens = (s: string) => Math.max(1, Math.ceil(s.length / 2));

export interface FakeEchoChatModelParams extends BaseChatModelParams {
  delayMs?: number;
}

/**
 * 离线假模型（provider kind = fake）：无需 Key 即可跑通本地链路。
 * - Prompt 含 TASK: profile.extract / job.extract / resume.generate：返回能通过 Zod 的 JSON
 * - 最后一条是用户消息：回声点评
 * - 否则：按已回答数量依次给出预置问题
 * 回声逐字输出；JSON 按小段输出，避免一份简历草稿等太久。
 */
export class FakeEchoChatModel extends BaseChatModel {
  private readonly delayMs: number;

  constructor(fields: FakeEchoChatModelParams = {}) {
    super(fields);
    this.delayMs = fields.delayMs ?? 25;
  }

  static override lc_name() {
    return 'FakeEchoChatModel';
  }

  override _llmType(): string {
    return 'fake-echo';
  }

  private respond(messages: BaseMessage[]): string {
    const structured = fakeStructuredReply(messages.map(textOf).join('\n'));
    if (structured) return structured;
    const convo = messages.filter((m) => m.getType() !== 'system');
    const last = convo.at(-1);
    if (last?.getType() === 'human') {
      const answer = textOf(last).trim();
      if (/^ping$/i.test(answer)) return 'pong';
      const preview = answer.length > 60 ? `${answer.slice(0, 60)}…` : answer;
      return `收到你的回答：「${preview}」。回答得不错，我们继续。`;
    }
    const answered = convo.filter((m) => m.getType() === 'human').length;
    return `第 ${answered + 1} 个问题：${QUESTIONS[answered % QUESTIONS.length]}`;
  }

  private usage(messages: BaseMessage[], output: string) {
    const input = estimateTokens(messages.map(textOf).join(''));
    const out = estimateTokens(output);
    return { input_tokens: input, output_tokens: out, total_tokens: input + out };
  }

  override async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    const text = this.respond(messages);
    return {
      generations: [
        { text, message: new AIMessage({ content: text, usage_metadata: this.usage(messages, text) }) },
      ],
    };
  }

  override async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    const text = this.respond(messages);
    const pieces = text.startsWith('{') ? (text.match(/[\s\S]{1,24}/g) ?? [text]) : Array.from(text);
    // delay 为 0 时也要让出事件循环。图在 stream() 返回前就开始跑，
    // 中间没有间断的话，token 会在 UI 流订阅之前被丢掉（回声图 resume 会踩中）。
    const delay = text.startsWith('{') ? Math.min(this.delayMs, 4) : this.delayMs;
    for (const [i, piece] of pieces.entries()) {
      options.signal?.throwIfAborted();
      await new Promise((r) => setTimeout(r, delay));
      const isLast = i === pieces.length - 1;
      const chunk = new ChatGenerationChunk({
        text: piece,
        message: new AIMessageChunk({
          content: piece,
          ...(isLast ? { usage_metadata: this.usage(messages, text) } : {}),
        }),
      });
      yield chunk;
      await runManager?.handleLLMNewToken(piece, undefined, undefined, undefined, undefined, { chunk });
    }
  }
}
