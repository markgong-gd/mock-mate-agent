/**
 * @file 【前端】应用入口
 * 做什么：创建 TanStack QueryClient（按 ApiClientError.retryable 决定重试）并挂载 React Router。
 * 怎么工作：index.html 加载本文件 → 渲染 <RouterProvider router={router} />。
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { ApiClientError } from './lib/api';
import { router } from './router';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => (err instanceof ApiClientError ? err.retryable && count < 2 : count < 2),
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
