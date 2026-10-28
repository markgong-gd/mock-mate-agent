/**
 * @file 【前端·数据】简历策划列表和详情
 * 对话本身走 useChat，不经过这里。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/frontend/lib/api';

export const studioKeys = {
  list: ['studio'] as const,
  one: (id: string) => ['studio', id] as const,
};

export function useStudios() {
  return useQuery({ queryKey: studioKeys.list, queryFn: () => unwrap(api.studio.$get()) });
}

export function useStudio(id: string | undefined) {
  return useQuery({
    queryKey: studioKeys.one(id ?? ''),
    enabled: Boolean(id),
    queryFn: () => unwrap(api.studio[':id'].$get({ param: { id: id ?? '' } })),
  });
}

export function useCreateStudio() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string }) => unwrap(api.studio.$post({ json: input })),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: studioKeys.list });
    },
  });
}

export function useDeleteStudio() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(api.studio[':id'].$delete({ param: { id } })),
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: studioKeys.list, exact: true });
    },
  });
}
