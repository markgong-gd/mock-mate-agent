/**
 * @file 【智能体·llm】provider 工厂
 * 做什么：按 kind（openai-compatible / deepseek / ollama / fake / dg-custom）创建 LangChain 模型实例；新增 provider 类型只改这里。
 */
import { ChatDeepSeek } from '@langchain/deepseek';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOllama } from '@langchain/ollama';
import { ChatOpenAI } from '@langchain/openai';
import type { ProviderConfig, ProviderKind } from '@/shared/env/server';
import { FakeEchoChatModel } from './fake';

export interface ChatModelOptions {
  timeoutMs: number;
  maxRetries: number;
  fakeDelayMs: number;
  /** 写入模型实例的 metadata，会随回调传给 usage 处理器 */
  metadata: Record<string, unknown>;
}

/**
 * dg-custom 的默认请求头。行为对齐 OpenAI 兼容网关：固定 X-Product，其余头有值才带。
 * 不引用外部客户端工厂，头在这里组装后交给 ChatOpenAI 的 configuration.defaultHeaders。
 */
export function dgCustomDefaultHeaders(
  p: Pick<ProviderConfig, 'enterpriseId' | 'userId' | 'domain' | 'ideType' | 'ideName' | 'ideVersion'>,
): Record<string, string> {
  const headers: Record<string, string> = { 'X-Product': 'SaaS' };
  if (p.enterpriseId) {
    headers['X-Enterprise-Id'] = p.enterpriseId;
    headers['X-Tenant-Id'] = p.enterpriseId;
  }
  if (p.userId) headers['X-User-Id'] = p.userId;
  if (p.domain) headers['X-Domain'] = p.domain;
  if (p.ideType) headers['X-IDE-Type'] = p.ideType;
  if (p.ideName) headers['X-IDE-Name'] = p.ideName;
  if (p.ideVersion) headers['X-IDE-Version'] = p.ideVersion;
  return headers;
}

/** kind -> LangChain 模型类工厂（02 §5.1）。新增 provider 类型只改这里 */
export function createChatModel(p: ProviderConfig, model: string, o: ChatModelOptions): BaseChatModel {
  switch (p.kind) {
    case 'openai-compatible':
      return new ChatOpenAI({
        model,
        apiKey: p.apiKey,
        configuration: { baseURL: p.baseUrl },
        timeout: o.timeoutMs,
        maxRetries: o.maxRetries,
        streamUsage: true,
        metadata: o.metadata,
      });
    case 'dg-custom':
      return new ChatOpenAI({
        model,
        apiKey: p.apiKey,
        configuration: {
          baseURL: p.baseUrl,
          defaultHeaders: dgCustomDefaultHeaders(p),
        },
        timeout: o.timeoutMs,
        maxRetries: o.maxRetries,
        streamUsage: true,
        metadata: o.metadata,
      });
    case 'deepseek':
      return new ChatDeepSeek({
        model,
        apiKey: p.apiKey,
        ...(p.baseUrl ? { configuration: { baseURL: p.baseUrl } } : {}),
        timeout: o.timeoutMs,
        maxRetries: o.maxRetries,
        streamUsage: true,
        metadata: o.metadata,
      });
    case 'ollama':
      return new ChatOllama({
        model,
        baseUrl: p.baseUrl ?? 'http://localhost:11434',
        maxRetries: o.maxRetries,
        metadata: o.metadata,
      });
    case 'fake':
      return new FakeEchoChatModel({ delayMs: o.fakeDelayMs, metadata: o.metadata });
  }
}

/** JSON mode 的调用参数（各 provider 字段不同）；不支持时返回 undefined */
export function jsonModeCallOptions(kind: ProviderKind): Record<string, unknown> | undefined {
  switch (kind) {
    case 'openai-compatible':
    case 'dg-custom':
    case 'deepseek':
      return { response_format: { type: 'json_object' } };
    case 'ollama':
      return { format: 'json' };
    case 'fake':
      return undefined;
  }
}
