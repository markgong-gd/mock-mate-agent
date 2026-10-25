/**
 * @file 【前端·数据】诊断报告、单场用量、专项训练
 * 报告是异步生成的：pending / running 时按 2 秒轮询，done 或 failed 后停下。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/frontend/lib/api';
import type { SkillTag } from '@/shared/schemas/skill-tags';

export const reportKeys = {
  all: ['reports'] as const,
  list: ['reports', 'list'] as const,
  bySession: (sessionId: string) => ['reports', 'session', sessionId] as const,
  one: (id: string) => ['reports', id] as const,
  usage: (sessionId: string) => ['usage', 'session', sessionId] as const,
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

/** 单场用量与成本（N-12）。诊断的调用也算在这场里，所以要等报告生成完再看才准 */
export function useSessionUsage(sessionId: string | undefined) {
  return useQuery({
    queryKey: reportKeys.usage(sessionId ?? ''),
    enabled: Boolean(sessionId),
    queryFn: () => unwrap(api.usage.sessions[':id'].$get({ param: { id: sessionId ?? '' } })),
  });
}

/** 一键专项训练（R-C2-5）：创建 drill 会话，调用方拿到 id 后跳到对话页 */
export function useCreateTraining() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { reportId: string; tag: string }) =>
      // 短板的 tag 在库里是 text（可能是旧版目录里的值），由服务端按 skillTagSchema 再校验一次
      unwrap(api.training.$post({ json: { ...input, tag: input.tag as SkillTag } })),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['interviews'] });
    },
  });
}
