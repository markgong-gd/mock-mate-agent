/**
 * @file 【前端·数据】成长曲线
 * 只在打开页面时取一次：诊断是异步的，但新报告出现得很慢，不需要轮询。
 */
import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/frontend/lib/api';

export const growthKeys = { all: ['growth'] as const };

export function useGrowth() {
  return useQuery({ queryKey: growthKeys.all, queryFn: () => unwrap(api.growth.$get()) });
}
