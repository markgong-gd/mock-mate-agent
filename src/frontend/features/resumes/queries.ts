/**
 * @file 【前端·数据】定制简历
 * 生成本身用 useObject 直接读文本流，不走这里。这里负责列表、保存和导出。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/frontend/lib/api';
import type { ResumeEditInput } from '@/shared/schemas/resume';

export const resumeKeys = {
  all: ['resumes'] as const,
  list: (jobId: string) => ['resumes', jobId] as const,
  byJob: (jobId: string) => ['resumes', jobId] as const,
  one: (id: string) => ['resumes', 'one', id] as const,
};

export function useAllResumes() {
  return useQuery({
    queryKey: resumeKeys.all,
    queryFn: () => unwrap(api.resumes.$get({ query: {} })),
  });
}

export function useResumes(jobId: string | undefined) {
  return useQuery({
    queryKey: resumeKeys.list(jobId ?? ''),
    enabled: Boolean(jobId),
    queryFn: () => unwrap(api.resumes.$get({ query: { jobId } })),
  });
}

export function useResume(resumeId: string) {
  return useQuery({
    queryKey: resumeKeys.one(resumeId),
    enabled: Boolean(resumeId),
    queryFn: () => unwrap(api.resumes[':id'].$get({ param: { id: resumeId } })),
  });
}

export function useSaveResume(resumeId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ResumeEditInput) =>
      unwrap(api.resumes[':id'].$put({ param: { id: resumeId }, json: body })),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: resumeKeys.all });
    },
  });
}
