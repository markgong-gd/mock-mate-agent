/**
 * @file 【前端·数据】模拟面试列表、创建和结束
 * 对话本身走 useChat，不经过这里。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/frontend/lib/api';
import type { InterviewSettings } from '@/shared/schemas/interview';

export const interviewKeys = {
  list: ['interviews'] as const,
  one: (id: string) => ['interviews', id] as const,
};

export function useInterviews() {
  return useQuery({ queryKey: interviewKeys.list, queryFn: () => unwrap(api.interviews.$get()) });
}

export function useInterview(id: string | undefined) {
  return useQuery({
    queryKey: interviewKeys.one(id ?? ''),
    enabled: Boolean(id),
    queryFn: () => unwrap(api.interviews[':id'].$get({ param: { id: id ?? '' } })),
  });
}

export function useCreateInterview() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { jobId: string; settings: InterviewSettings }) =>
      unwrap(api.interviews.$post({ json: input })),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: interviewKeys.list });
    },
  });
}

export function useFinishInterview(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.interviews[':id'].finish.$post({ param: { id } })),
    onSuccess: async (interview) => {
      client.setQueryData(interviewKeys.one(id), interview);
      await client.invalidateQueries({ queryKey: interviewKeys.list });
    },
  });
}
