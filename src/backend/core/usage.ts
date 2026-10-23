/**
 * @file 【后端·core】用量回调组装
 * 做什么：把 agent/llm/usage.ts 的 UsageCallbackHandler 与 backend/db 的 insertLlmCall 接起来。
 * 为什么放在 core：agent/llm 层不允许依赖 db，写库的 sink 由 core 注入（依赖倒置）。
 */
import { insertLlmCall } from '@/backend/db/repos/llm-calls';
import { UsageCallbackHandler, type UsageContext } from '@/agent/llm/usage';

/** 组装用量回调：llm 层只定义处理器，写库的 sink 在 core 注入（llm 不依赖 db） */
export function createUsageHandler(ctx: UsageContext): UsageCallbackHandler {
  return new UsageCallbackHandler(ctx, (r) => insertLlmCall(r));
}
