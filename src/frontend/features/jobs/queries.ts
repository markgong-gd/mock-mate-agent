/**
 * @file 【前端·数据】目标岗位
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/frontend/lib/api';

export const jobKeys = {
  list: ['jobs'] as const,
  one: (id: string) => ['jobs', id] as const,
};

export function useJobs() {
  return useQuery({ queryKey: jobKeys.list, queryFn: () => unwrap(api.jobs.$get()) });
}

export function useJob(jobId: string) {
  return useQuery({
    queryKey: jobKeys.one(jobId),
    enabled: Boolean(jobId),
    queryFn: () => unwrap(api.jobs[':id'].$get({ param: { id: jobId } })),
  });
}

export function useCreateJob() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (jdText: string) => unwrap(api.jobs.$post({ json: { jdText } })),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: jobKeys.list });
    },
  });
}
