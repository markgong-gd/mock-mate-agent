/**
 * @file 【后端·core】成长曲线（R-C3-5）
 * 做什么：把 skill_score_history 按技能分组成折线，再带一条总分折线。
 * 为什么不在前端算：分组和排序规则（哪些技能值得画）要和"短板优先出题"口径一致，放后端一处维护。
 * 只有一个点的技能也返回：第一次面试就该看到基线，前端会标注"仅 1 次"。
 */
import { listReports, listSkillScoreHistory } from '@/backend/db/repos/diagnosis';
import type { RequestCtx } from '@/shared/common/ctx';
import type { GrowthPoint, GrowthSkill, GrowthView } from '@/shared/schemas/growth';
import { skillLabel } from '@/shared/schemas/skill-tags';

const REPORT_LIMIT = 200;

export async function getGrowth(ctx: RequestCtx): Promise<GrowthView> {
  const [history, reports] = await Promise.all([
    listSkillScoreHistory(ctx.userId),
    listReports(ctx.userId, REPORT_LIMIT),
  ]);

  const byTag = new Map<string, GrowthPoint[]>();
  for (const row of history) {
    const point: GrowthPoint = {
      reportId: row.reportId,
      sessionId: row.sessionId,
      jobTitle: row.jobTitle,
      score: row.score,
      sampleCount: row.sampleCount,
      rubricVersion: row.rubricVersion,
      createdAt: row.createdAt.toISOString(),
    };
    byTag.set(row.tag, [...(byTag.get(row.tag) ?? []), point]);
  }

  const skills: GrowthSkill[] = [...byTag]
    .map(([tag, points]) => {
      const first = points[0]!.score;
      const last = points.at(-1)!.score;
      return {
        tag,
        label: skillLabel(tag),
        points,
        first,
        last,
        delta: Math.round((last - first) * 10) / 10,
      };
    })
    // 练得多的在前；次数相同时把退步最明显的排前面，便于发现问题
    .sort((a, b) => b.points.length - a.points.length || a.delta - b.delta || a.tag.localeCompare(b.tag));

  const overall = reports
    .filter((report) => report.status === 'done' && report.overall !== null)
    .map((report) => ({
      reportId: report.id,
      jobTitle: report.jobTitle,
      overall: report.overall!,
      rubricVersion: report.rubricVersion,
      createdAt: report.createdAt.toISOString(),
    }))
    .reverse(); // listReports 按时间倒序，折线要升序

  return { skills, overall };
}
