/**
 * @file 【前端·数据】回声图相关的 TanStack Query hooks
 * 做什么：useEchoThread(threadId) 调 GET /api/dev/echo/:threadId，从后端存档恢复对话历史与进度。
 */
import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/frontend/lib/api';

export const echoKeys = { thread: (id: string) => ['dev', 'echo', id] as const };

export const useEchoThread = (threadId: string) =>
  useQuery({
    queryKey: echoKeys.thread(threadId),
    queryFn: () => unwrap(api.dev.echo[':threadId'].$get({ param: { threadId } })),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
