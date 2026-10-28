/**
 * @file 【前端·策划】useChat 只提交本轮内容和它的幂等键
 * 开始、续跑不带内容。幂等键用这条用户消息的 id，重试时还是同一条。
 */
import { DefaultChatTransport, type UIMessage } from 'ai';

const lastUser = (messages: UIMessage[]) =>
  [...messages].reverse().find((message) => message.role === 'user');

const lastUserText = (messages: UIMessage[]): string =>
  lastUser(messages)
    ?.parts.filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('') ?? '';

export function createStudioTransport(sessionId: string) {
  let kick = false;
  const transport = new DefaultChatTransport<UIMessage>({
    api: `/api/studio/${sessionId}/chat`,
    credentials: 'same-origin',
    prepareSendMessagesRequest: ({ messages, trigger }) => {
      if (kick) {
        kick = false;
        return { body: { message: '' } };
      }
      const message = trigger === 'submit-message' ? lastUserText(messages) : '';
      const id = lastUser(messages)
        ?.id.replace(/[^A-Za-z0-9:_-]/g, '')
        .slice(0, 80);
      return { body: { message, ...(message && id ? { idempotencyKey: id } : {}) } };
    },
  });
  return {
    transport,
    /** 下一次发送改成空 message，用于开始和从失败节点续跑 */
    sendEmpty() {
      kick = true;
    },
  };
}
