/**
 * @file 【前端·面试】useChat 只提交本轮回答和它的幂等键
 * 开始、续跑不带回答。幂等键用这条用户消息的 id，重试时还是同一条。
 */
import { DefaultChatTransport, type UIMessage } from 'ai';

const lastUser = (messages: UIMessage[]) =>
  [...messages].reverse().find((message) => message.role === 'user');

const lastUserText = (messages: UIMessage[]): string =>
  lastUser(messages)
    ?.parts.filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('') ?? '';

export function createInterviewTransport(sessionId: string) {
  let kick = false;
  const transport = new DefaultChatTransport<UIMessage>({
    api: `/api/interviews/${sessionId}/chat`,
    credentials: 'same-origin',
    prepareSendMessagesRequest: ({ messages, trigger }) => {
      if (kick) {
        kick = false;
        return { body: { answer: '' } };
      }
      const answer = trigger === 'submit-message' ? lastUserText(messages) : '';
      const id = lastUser(messages)
        ?.id.replace(/[^A-Za-z0-9:_-]/g, '')
        .slice(0, 80);
      return { body: { answer, ...(answer && id ? { idempotencyKey: id } : {}) } };
    },
  });
  return {
    transport,
    /** 下一次发送改成空 answer，用于开始和从失败节点续跑 */
    sendEmpty() {
      kick = true;
    },
  };
}
