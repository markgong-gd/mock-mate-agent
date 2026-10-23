/**
 * @file 【智能体·llm】模型注册表
 * 做什么：解析 MODEL_<ALIAS>=<provider>:<model>，getChatModel(alias) 返回带缓存的模型实例；
 *        assertRegistry() 启动时校验别名完整、provider 在白名单内。业务代码只认别名，换模型只改 .env。
 */
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  CHAT_ALIASES,
  serverEnv,
  type ChatAlias,
  type ProviderKind,
  type ServerEnv,
} from '@/shared/env/server';
import { AppError } from '@/shared/common/errors';
import { resolveCaps, type ModelCaps } from './caps';
import { createChatModel, jsonModeCallOptions } from './providers';

export type { ChatAlias };

export interface ResolvedChatModel {
  alias: ChatAlias;
  /** provider:model */
  id: string;
  provider: string;
  kind: ProviderKind;
  modelName: string;
  model: BaseChatModel;
  caps: ModelCaps;
  jsonModeOptions?: Record<string, unknown>;
}

/** 写入模型 metadata 的键（usage 回调据此识别别名与模型） */
export const META_KEYS = { alias: 'mm_alias', modelId: 'mm_model_id', provider: 'mm_provider' } as const;

const cache = new Map<ChatAlias, ResolvedChatModel>();

function resolve(env: ServerEnv['llm'], alias: ChatAlias): ResolvedChatModel | undefined {
  const ref = env.models[alias];
  if (!ref) return undefined;
  const provider = env.providers[ref.provider];
  if (!provider) throw new AppError('INTERNAL', `provider "${ref.provider}" 未配置`);
  if (env.allowedProviders !== '*' && !env.allowedProviders.includes(ref.provider)) {
    throw new AppError('INTERNAL', `provider "${ref.provider}" 不在 ALLOWED_PROVIDERS 白名单中`);
  }
  const model = createChatModel(provider, ref.model, {
    timeoutMs: env.timeoutMs,
    maxRetries: env.maxRetries,
    fakeDelayMs: env.fakeDelayMs,
    metadata: { [META_KEYS.alias]: alias, [META_KEYS.modelId]: ref.id, [META_KEYS.provider]: ref.provider },
  });
  return {
    alias,
    id: ref.id,
    provider: ref.provider,
    kind: provider.kind,
    modelName: ref.model,
    model,
    caps: resolveCaps(provider.kind, ref.model, env.caps[alias]),
    jsonModeOptions: jsonModeCallOptions(provider.kind),
  };
}

/** 按别名取模型（带缓存）。业务代码只使用别名，provider 与模型由环境变量决定 */
export function getChatModel(alias: ChatAlias): ResolvedChatModel {
  const hit = cache.get(alias);
  if (hit) return hit;
  const resolved = resolve(serverEnv().llm, alias);
  if (!resolved) throw new AppError('INTERNAL', `模型别名 "${alias}" 未配置（MODEL_${alias.toUpperCase()}）`);
  cache.set(alias, resolved);
  return resolved;
}

export function hasChatModel(alias: ChatAlias): boolean {
  return Boolean(serverEnv().llm.models[alias]);
}

/** 启动时校验：别名完整、provider 已配置且在白名单内 */
export function assertRegistry(): { alias: ChatAlias; id: string }[] {
  const env = serverEnv().llm;
  return CHAT_ALIASES.filter((a) => env.models[a]).map((a) => {
    const r = getChatModel(a);
    return { alias: a, id: r.id };
  });
}

export function resetRegistryForTesting() {
  cache.clear();
}

/** 测试用：直接注入某个别名的模型 */
export function setChatModelForTesting(alias: ChatAlias, resolved: Omit<ResolvedChatModel, 'alias'>) {
  cache.set(alias, { ...resolved, alias });
}
