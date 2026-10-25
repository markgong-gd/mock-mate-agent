/**
 * @file 【测试工具】测试环境变量与流读取
 * 做什么：baseTestEnv / useTestEnv 注入使用 fake 模型的测试配置；readAll 把 ReadableStream 读成数组。
 */
import { parseServerEnv, setServerEnvForTesting, type ServerEnv } from '@/shared/env/server';
import { resetRegistryForTesting } from '@/agent/llm/registry';

export const TEST_USER_ID = '00000000-0000-4000-8000-0000000000aa';

export const baseTestEnv = (overrides: Record<string, string | undefined> = {}) => ({
  NODE_ENV: 'test',
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://mockmate:mockmate@localhost:5432/mockmate_test',
  DEV_USER_ID: TEST_USER_ID,
  PROVIDERS: 'fake',
  PROVIDER_FAKE_KIND: 'fake',
  MODEL_CHAT: 'fake:echo',
  MODEL_JUDGE: 'fake:echo',
  MODEL_EXTRACT: 'fake:echo',
  MODEL_EMBED: 'fake:hash',
  EMBEDDING_DIM: '1024',
  FAKE_LLM_DELAY_MS: '0',
  ...overrides,
});

/** 注入一份只用 fake provider 的配置，并清空模型缓存 */
export function useTestEnv(overrides: Record<string, string | undefined> = {}): ServerEnv {
  const env = parseServerEnv(baseTestEnv(overrides));
  setServerEnvForTesting(env);
  resetRegistryForTesting();
  return env;
}

export async function readAll<T>(stream: ReadableStream<T>): Promise<T[]> {
  const out: T[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out;
    out.push(value);
  }
}
