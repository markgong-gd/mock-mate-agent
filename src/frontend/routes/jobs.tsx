/**
 * @file 【前端·页面】目标岗位
 * 粘贴 JD，解析出技能要求，并对照档案显示匹配度和缺口。
 */
import { useState } from 'react';
import { Link } from 'react-router';
import { Loader2 } from 'lucide-react';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { Textarea } from '@/frontend/components/ui/textarea';
import { SkillGapPanel } from '@/frontend/features/jobs/skill-gap-panel';
import { useCreateJob, useJobs } from '@/frontend/features/jobs/queries';
import { ApiClientError } from '@/frontend/lib/api';

export default function JobsPage() {
  const jobs = useJobs();
  const create = useCreateJob();
  const [jdText, setJdText] = useState('');
  const [error, setError] = useState('');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">目标岗位</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          粘贴 JD。技能标签和档案用同一套目录，所以匹配度能逐条对上。
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>解析 JD</CardTitle>
          <CardDescription>解析结果会保存。同一份 JD 可以之后生成多版简历。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            className="min-h-40"
            value={jdText}
            placeholder="把岗位描述粘贴在这里"
            onChange={(e) => setJdText(e.target.value)}
          />
          <Button
            disabled={jdText.trim().length < 10 || create.isPending}
            onClick={() => {
              setError('');
              create.mutate(jdText, {
                onSuccess: () => setJdText(''),
                onError: (err) => setError(err instanceof ApiClientError ? err.message : '解析失败'),
              });
            }}
          >
            {create.isPending && <Loader2 className="animate-spin" />}
            解析并计算匹配度
          </Button>
          {error && <p className="text-destructive text-sm">{error}</p>}
          {create.data && (
            <div className="rounded-md border p-3">
              <div className="mb-2 font-medium">{create.data.job.title}</div>
              <SkillGapPanel match={create.data.match} />
            </div>
          )}
        </CardContent>
      </Card>
      <div className="space-y-3">
        {jobs.data?.jobs.map(({ job, match }) => (
          <Card key={job.id}>
            <CardHeader>
              <CardTitle className="text-base">
                <Link to={`/jobs/${job.id}`} className="hover:underline">
                  {job.title}
                </Link>
              </CardTitle>
              <CardDescription>{job.company ?? '未填写公司'}</CardDescription>
            </CardHeader>
            <CardContent>
              <SkillGapPanel match={match} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
