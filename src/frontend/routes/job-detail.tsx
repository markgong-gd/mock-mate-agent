/**
 * @file 【前端·页面】单个岗位的要求与缺口
 */
import { Link, useParams } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { SkillGapPanel } from '@/frontend/features/jobs/skill-gap-panel';
import { useJob } from '@/frontend/features/jobs/queries';

export default function JobDetailPage() {
  const { jobId = '' } = useParams();
  const job = useJob(jobId);
  if (job.isPending) return <p className="text-muted-foreground text-sm">加载中…</p>;
  if (!job.data) return <p className="text-sm">找不到这个岗位。</p>;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{job.data.job.title}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{job.data.job.summary}</p>
      </div>
      <SkillGapPanel match={job.data.match} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">要求</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {job.data.job.requirements.map((req) => (
            <div key={req.id}>
              {req.importance === 'must' ? '必备' : '加分'} · {req.label}
              {req.description ? `：${req.description}` : ''}
            </div>
          ))}
        </CardContent>
      </Card>
      <Link to={`/resumes?jobId=${job.data.job.id}`} className="text-sm underline">
        用这个岗位生成简历
      </Link>
    </div>
  );
}
