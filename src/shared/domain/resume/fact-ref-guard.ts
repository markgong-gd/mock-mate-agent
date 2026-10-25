/**
 * @file 【公共·domain】简历事实溯源校验
 * 做什么：对照“这次允许引用的事实 id”，把无效或缺失引用的 bullet 标成 unverified。
 * 为什么不直接抛错：用户需要看到哪一条有问题并改掉。导出时再拒绝（409）。
 * 模型自己写的 status 会被覆盖，不能靠输出 `"status":"verified"` 绕过。
 */
import type { ResumeContent } from '@/shared/schemas/resume';

export interface FactRefGuardResult {
  content: ResumeContent;
  unverifiedCount: number;
}

export function factRefGuard(draft: ResumeContent, allowedFactIds: readonly string[]): FactRefGuardResult {
  const allowed = new Set(allowedFactIds);
  let unverifiedCount = 0;
  const sections = draft.sections.map((section) => ({
    ...section,
    bullets: section.bullets.map((bullet) => {
      const ok = bullet.factRefs.length > 0 && bullet.factRefs.every((id) => allowed.has(id));
      if (!ok) unverifiedCount += 1;
      return { ...bullet, status: ok ? ('verified' as const) : ('unverified' as const) };
    }),
  }));
  return { content: { ...draft, sections }, unverifiedCount };
}

export function hasUnverified(content: ResumeContent): boolean {
  return content.sections.some((section) => section.bullets.some((bullet) => bullet.status === 'unverified'));
}
