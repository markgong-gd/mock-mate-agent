/**
 * @file 【前端·页面】定制简历
 * 选择岗位后，useObject 消费 /api/resumes/generate 的 JSON 文本流，边生成边渲染。
 * 流里是模型草稿；guard 之后的最终版本在列表里，点进去再改、再导出。
 */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useObject } from '@ai-sdk/react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { useJobs } from '@/frontend/features/jobs/queries';
import { resumeKeys, useResumes } from '@/frontend/features/resumes/queries';
import { ResumePreview } from '@/frontend/features/resumes/resume-preview';
import { resumeContentSchema } from '@/shared/schemas/resume';

export default function ResumesPage() {
  const jobs = useJobs();
  const [params] = useSearchParams();
  const initialJob = params.get('jobId') ?? '';
  const [jobId, setJobId] = useState(initialJob);
  const versions = useResumes(jobId || undefined);
  const queryClient = useQueryClient();
  const { object, submit, isLoading, error, stop } = useObject({
    api: '/api/resumes/generate',
    schema: resumeContentSchema,
    credentials: 'same-origin',
    onFinish: () => {
      void queryClient.invalidateQueries({ queryKey: resumeKeys.all });
      if (jobId) void queryClient.invalidateQueries({ queryKey: resumeKeys.byJob(jobId) });
    },
  });
  const preview = useMemo(() => object, [object]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">定制简历</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          每条描述都要引用档案里的事实。标成未溯源的版本可以改，但不能导出。内容由 AI 生成。
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>生成</CardTitle>
          <CardDescription>同一岗位可以生成多个版本，旧版本会保留。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <select
            className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
          >
            <option value="">选择目标岗位</option>
            {jobs.data?.jobs.map(({ job }) => (
              <option key={job.id} value={job.id}>
                {job.title}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button disabled={!jobId || isLoading} onClick={() => submit({ jobId })}>
              {isLoading && <Loader2 className="animate-spin" />}
              生成简历
            </Button>
            {isLoading && (
              <Button variant="outline" onClick={stop}>
                停止
              </Button>
            )}
          </div>
          {error && <p className="text-destructive text-sm">{error.message}</p>}
          <ResumePreview content={preview} />
        </CardContent>
      </Card>
      <div className="space-y-2">
        {versions.data?.resumes.map((resume) => {
          const unverified = resume.content.sections.some((section) =>
            section.bullets.some((bullet) => bullet.status === 'unverified'),
          );
          return (
            <Link
              key={resume.id}
              to={`/resumes/${resume.id}`}
              className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            >
              <span>
                {resume.jobTitle} · 版本 {resume.version}
              </span>
              <span className="text-muted-foreground">{unverified ? '含未溯源' : '可导出'}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
