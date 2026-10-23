/**
 * @file 【前端·基础】样式工具
 * 做什么：cn() = clsx + tailwind-merge，合并 className 并消除冲突的 Tailwind 类（shadcn/ui 约定）。
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
