/**
 * @file 【前端·页面】根布局
 * 做什么：左侧导航 + 右侧 <Outlet/> 渲染子页面。
 * 怎么工作：调用 /api/meta 判断是否开启开发路由，决定是否显示"回声图（调试）"菜单。
 */
import { NavLink, Outlet } from 'react-router';
import { useMeta } from '@/frontend/features/system/queries';
import { cn } from '@/frontend/lib/utils';
import { clientEnv } from '@/shared/env/client';
import { NAV_ITEMS } from '../nav';

export function RootLayout() {
  const meta = useMeta();
  const items = NAV_ITEMS.filter((n) => !n.dev || meta.data?.devRoutes);

  return (
    <div className="flex min-h-screen">
      <aside className="bg-muted/40 hidden w-56 shrink-0 border-r md:flex md:flex-col">
        <div className="px-5 py-5">
          <div className="text-lg font-semibold tracking-tight">{clientEnv.VITE_APP_NAME}</div>
          <div className="text-muted-foreground text-xs">求职者侧智能面试 Agent</div>
        </div>
        <nav className="flex flex-col gap-0.5 px-2">
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-background font-medium shadow-xs'
                    : 'text-muted-foreground hover:bg-background/60',
                )
              }
            >
              <n.icon className="size-4" />
              <span className="flex-1">{n.label}</span>
              {n.phase && <span className="text-muted-foreground/70 text-[10px]">{n.phase}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="text-muted-foreground mt-auto px-5 py-4 text-[11px] leading-relaxed">
          页面中的面试、简历与报告内容由 AI 生成
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b px-4 py-3 md:hidden">
          <span className="font-semibold">{clientEnv.VITE_APP_NAME}</span>
          <nav className="flex gap-3 overflow-x-auto text-sm">
            {items
              .filter((n) => !n.phase)
              .map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end
                  className={({ isActive }) => (isActive ? 'font-medium' : '')}
                >
                  {n.label}
                </NavLink>
              ))}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
