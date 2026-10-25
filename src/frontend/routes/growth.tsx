/**
 * @file 【前端·页面】成长曲线
 * 展示同一技能在多次诊断里的得分趋势（R-C3-5），数据来自 skill_score_history，纵轴固定 1–5。
 * 只练过一次的技能也列出来：第一场就该看到基线，但会标注"仅 1 次"提醒别过度解读。
 */
import { Link } from 'react-router';
import { Loader2, TrendingDown, TrendingUp } from 'lucide-react';
import { Badge } from '@/frontend/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { useGrowth } from '@/frontend/features/growth/queries';
import { TrendLine } from '@/frontend/features/growth/trend';
import type { GrowthSkill } from '@/shared/schemas/growth';

const day = (iso: string) => new Date(iso).toLocaleDateString();

export default function GrowthPage() {
  const growth = useGrowth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">成长曲线</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          每场面试的诊断报告都会留下技能得分，这里按技能把它们连起来。分数区间 1–5，和报告里的评分标准一致。
        </p>
      </div>

      {growth.isPending && <Loader2 className="text-muted-foreground size-5 animate-spin" />}
      {growth.isError && <p className="text-destructive text-sm">{growth.error.message}</p>}

      {growth.data?.skills.length === 0 && (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            还没有可比较的数据。
            <Link to="/interviews" className="underline">
              先完成一场模拟面试
            </Link>
            ，诊断报告生成后这里就会有曲线。
          </CardContent>
        </Card>
      )}

      {growth.data && growth.data.overall.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">总分趋势</CardTitle>
            <CardDescription>
              按各维度权重加权的总分，共 {growth.data.overall.length} 份报告。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TrendLine
              ariaLabel="总分趋势"
              data={growth.data.overall.map((point) => ({
                label: day(point.createdAt),
                score: point.overall,
              }))}
            />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {growth.data?.skills.map((skill) => (
          <SkillCard key={skill.tag} skill={skill} />
        ))}
      </div>
    </div>
  );
}

function SkillCard({ skill }: { skill: GrowthSkill }) {
  const single = skill.points.length === 1;
  const up = skill.delta > 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {skill.label}
          {single ? (
            <Badge variant="outline">仅 1 次</Badge>
          ) : (
            <Badge variant={up ? 'secondary' : 'destructive'} className="gap-1">
              {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
              {up ? '+' : ''}
              {skill.delta.toFixed(1)}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          最近 {skill.last.toFixed(1)} 分 · 共 {skill.points.length} 次 ·{' '}
          {skill.points.reduce((sum, point) => sum + point.sampleCount, 0)} 道题
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <TrendLine
          ariaLabel={`${skill.label}得分趋势`}
          data={skill.points.map((point) => ({ label: day(point.createdAt), score: point.score }))}
        />
        <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {skill.points.map((point) => (
            <Link key={point.reportId} to={`/reports/${point.reportId}`} className="hover:underline">
              {day(point.createdAt)} · {point.score.toFixed(1)}
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
