/**
 * @file 【前端·数据】诊断报告
 * 报告是异步生成的：pending / running 时按 2 秒轮询，done 或 failed 后停下。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/frontend/lib/api';

export const reportKeys = {
  all: ['reports'] as const,
  list: ['reports', 'list'] as const,
  bySession: (sessionId: string) => ['reports', 'session', sessionId] as const,
  one: (id: string) => ['reports', id] as const,
};

/** 生成中才轮询，避免报告页一直打接口 */
const POLL_MS = 2000;
const pollWhilePending = (status: string | undefined) =>
  status === 'pending' || status === 'running' ? POLL_MS : false;

export function useReports() {
  return useQuery({
    queryKey: reportKeys.list,
    queryFn: () => unwrap(api.reports.$get({ query: {} })),
    refetchInterval: (query) =>
      query.state.data?.reports.some((report) => pollWhilePending(report.status) !== false) ? POLL_MS : false,
  });
}

/** 面试结束后用它找到这场面试的报告 */
export function useSessionReport(sessionId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: reportKeys.bySession(sessionId ?? ''),
    enabled: Boolean(sessionId) && enabled,
    queryFn: () => unwrap(api.reports.$get({ query: { sessionId: sessionId ?? '' } })),
    refetchInterval: (query) => (query.state.data?.reports.length === 0 ? POLL_MS : false),
  });
}

export function useReport(id: string | undefined) {
  return useQuery({
    queryKey: reportKeys.one(id ?? ''),
    enabled: Boolean(id),
    queryFn: () => unwrap(api.reports[':id'].$get({ param: { id: id ?? '' } })),
    refetchInterval: (query) => pollWhilePending(query.state.data?.status),
  });
}

export function useRetryReport(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.reports[':id'].retry.$post({ param: { id } })),
    onSuccess: async (report) => {
      client.setQueryData(reportKeys.one(id), report);
      await client.invalidateQueries({ queryKey: reportKeys.list });
    },
  });
}
