/**
 * @file 【智能体·graphs】图运行配置约定
 * 做什么：GraphConfigurable { thread_id, userId, requestId } 通过 config.configurable 注入；getGraphCtx() 在节点内读取。
 * 为什么：身份不作为 LLM 可见参数，防止 Prompt 注入越权。
 */
import type { LangGraphRunnableConfig } from '@langchain/langgraph';

/** 通过 config.configurable 注入；工具与节点不把 userId 当参数（02 §1.2 约定 4） */
export interface GraphConfigurable {
  thread_id: string;
  userId: string;
  requestId: string;
}

export function getGraphCtx(config: LangGraphRunnableConfig): GraphConfigurable {
  const c = (config.configurable ?? {}) as Partial<GraphConfigurable>;
  if (!c.thread_id || !c.userId || !c.requestId) {
    throw new Error('graph config 缺少 thread_id / userId / requestId');
  }
  return { thread_id: c.thread_id, userId: c.userId, requestId: c.requestId };
}
