/**
 * @file 【前端·基础】useChat 的自定义 transport
 * 做什么：流式对话请求只把"本轮回答" { answer } 发给后端，而不是整段历史。
 * 为什么：对话历史以后端 LangGraph 存档为准，前端不是真相源。
 */
import { DefaultChatTransport, type UIMessage } from 'ai';

const lastUserText = (messages: UIMessage[]): string => {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  return (
    last?.parts
      .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
      .map((p) => p.text)
      .join('') ?? ''
  );
};

/**
 * 流式端点 transport（替换边界见 02 §1.3）：
 * 后端以存档为准，只需要本轮回答，不回传整段历史。
 * AI SDK 的 sendMessage() 不带消息时也会走 submit-message，开始和续跑要用 sendEmpty() 强制空回答。
 */
export function createAnswerTransport(api: string) {
  let kick = false;
  const transport = new DefaultChatTransport<UIMessage>({
    api,
    credentials: 'same-origin',
    prepareSendMessagesRequest: ({ messages, trigger }) => {
      if (kick) {
        kick = false;
        return { body: { answer: '' } };
      }
      return { body: { answer: trigger === 'submit-message' ? lastUserText(messages) : '' } };
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
