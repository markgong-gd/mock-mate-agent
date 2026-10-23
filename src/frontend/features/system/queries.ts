/**
 * @file 【前端·数据】系统状态相关的 TanStack Query hooks
 * 做什么：useMeta / useHealth / useReady / usePing，封装对 /api/meta、/api/healthz、/api/readyz、/api/llm/ping 的请求。
 * 怎么工作：通过 lib/api.ts 的类型安全客户端调用，路径与返回类型都来自后端 AppType。
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/frontend/lib/api';

export const systemKeys = {
  meta: ['system', 'meta'] as const,
  health: ['system', 'healthz'] as const,
  ready: ['system', 'readyz'] as const,
};

export const useMeta = () => useQuery({ queryKey: systemKeys.meta, queryFn: () => unwrap(api.meta.$get()) });

export const useHealth = () =>
  useQuery({
    queryKey: systemKeys.health,
    queryFn: () => unwrap(api.healthz.$get()),
    refetchInterval: 30_000,
  });

/** readyz 失败时返回 503，这里直接读取 body 以展示各项检查 */
export const useReady = () =>
  useQuery({
    queryKey: systemKeys.ready,
    queryFn: async () => (await api.readyz.$get()).json(),
    refetchInterval: 30_000,
  });

export type ChatAliasName = 'chat' | 'judge' | 'extract' | 'fallback';

export const usePing = () =>
  useMutation({ mutationFn: (alias: ChatAliasName) => unwrap(api.llm.ping.$get({ query: { alias } })) });
