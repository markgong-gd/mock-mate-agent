/**
 * @file 【前端】侧边栏菜单定义
 * 做什么：集中定义导航项（路径、文案、图标、计划上线阶段 phase、是否仅开发可见 dev）。
 * 被谁用：routes/root-layout.tsx 渲染菜单；router.tsx 为未上线页面生成占位路由。
 */
import {
  Activity,
  BarChart3,
  Briefcase,
  FileText,
  Mic,
  Settings,
  TrendingUp,
  UserRound,
  Waves,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** 计划上线的阶段；为空表示已可用 */
  phase?: string;
  dev?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: '系统状态', icon: Activity },
  { to: '/profile', label: '职业档案', icon: UserRound },
  { to: '/jobs', label: '目标岗位', icon: Briefcase },
  { to: '/resumes', label: '定制简历', icon: FileText },
  { to: '/interviews', label: '模拟面试', icon: Mic, phase: 'P2a' },
  { to: '/reports', label: '诊断报告', icon: BarChart3, phase: 'P2b' },
  { to: '/growth', label: '成长曲线', icon: TrendingUp, phase: 'P3' },
  { to: '/settings', label: '设置', icon: Settings, phase: 'P5' },
  { to: '/dev/echo', label: '回声图（调试）', icon: Waves, dev: true },
];
