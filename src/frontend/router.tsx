/**
 * @file 【前端】路由表
 * 做什么：声明 URL → 页面组件的映射；每个页面按需懒加载（按路由分包）。
 * 怎么工作：根路由用 RootLayout 做外壳；nav.ts 中带 phase 的条目暂时指向 placeholder 页。
 * 新增页面：在 routes/ 写页面 → 在这里注册 → 在 nav.ts 去掉 phase。
 */
import { createBrowserRouter } from 'react-router';
import { NAV_ITEMS } from './nav';
import { RootLayout } from './routes/root-layout';

const page = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({
  Component: (await load()).default,
});

/** 按路由分包（02 §12）；P1 以后的页面暂为占位 */
export const router = createBrowserRouter([
  {
    path: '/',
    Component: RootLayout,
    HydrateFallback: () => null,
    children: [
      { index: true, lazy: page(() => import('./routes/home')) },
      { path: 'profile', lazy: page(() => import('./routes/profile')) },
      { path: 'jobs', lazy: page(() => import('./routes/jobs')) },
      { path: 'jobs/:jobId', lazy: page(() => import('./routes/job-detail')) },
      { path: 'resumes', lazy: page(() => import('./routes/resumes')) },
      { path: 'resumes/:resumeId', lazy: page(() => import('./routes/resume-editor')) },
      { path: 'resumes/:resumeId/print', lazy: page(() => import('./routes/resume-print')) },
      { path: 'dev/echo', lazy: page(() => import('./routes/dev-echo')) },
      ...NAV_ITEMS.filter((n) => n.phase).map((n) => ({
        path: n.to.slice(1),
        lazy: page(() => import('./routes/placeholder')),
      })),
      { path: '*', lazy: page(() => import('./routes/not-found')) },
    ],
  },
]);
