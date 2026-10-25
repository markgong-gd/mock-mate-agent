/**
 * @file 【前端·页面】编辑某一版简历
 * 保存会写成下一版本，不覆盖当前行。导出前如果还有未溯源条目，后端返回 409。
 */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { Textarea } from '@/frontend/components/ui/textarea';
import { useProfile } from '@/frontend/features/profile/queries';
import { useResume, useSaveResume } from '@/frontend/features/resumes/queries';
import { ApiClientError } from '@/frontend/lib/api';
import type { ResumeContent } from '@/shared/schemas/resume';

export default function ResumeEditorPage() {
  const { resumeId = '' } = useParams();
  const navigate = useNavigate();
  const resume = useResume(resumeId);
  const profile = useProfile();
  const save = useSaveResume(resumeId);
  const remote = resume.data?.resume;
  const [loadedId, setLoadedId] = useState('');
  const [content, setContent] = useState<ResumeContent | null>(null);
  const [error, setError] = useState('');

  if (remote && remote.id !== loadedId) {
    setLoadedId(remote.id);
    setContent(remote.content);
    setError('');
  }

  if (!content || !resume.data) return <p className="text-muted-foreground text-sm">加载中…</p>;
  const facts = profile.data?.profile?.experiences.flatMap((exp) => exp.facts) ?? [];
  const unverified = content.sections.some((section) =>
    section.bullets.some((bullet) => bullet.status === 'unverified'),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {resume.data.resume.jobTitle} · 版本 {resume.data.resume.version}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">AI 生成的草稿。改完保存会成为新版本。</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">内容</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={content.summary}
            onChange={(e) => setContent({ ...content, summary: e.target.value })}
          />
          {content.sections.map((section, sectionIndex) => (
            <div key={`${section.heading}-${sectionIndex}`} className="space-y-2">
              <div className="text-sm font-medium">{section.heading}</div>
              {section.bullets.map((bullet, bulletIndex) => (
                <div key={`${sectionIndex}-${bulletIndex}`} className="space-y-1">
                  <Textarea
                    value={bullet.text}
                    onChange={(e) => {
                      const sections = content.sections.slice();
                      const bullets = section.bullets.slice();
                      bullets[bulletIndex] = { ...bullet, text: e.target.value };
                      sections[sectionIndex] = { ...section, bullets };
                      setContent({ ...content, sections });
                    }}
                  />
                  <p className="text-muted-foreground text-xs">
                    {bullet.status === 'unverified' ? '未溯源。' : '已溯源。'}
                    关联事实：
                    {bullet.factRefs.map((id) => facts.find((fact) => fact.id === id)?.text ?? id).join('；')}
                  </p>
                </div>
              ))}
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={save.isPending}
              onClick={() => {
                setError('');
                save.mutate(
                  { ...content, asNewVersion: true },
                  {
                    onSuccess: (data) => {
                      void navigate(`/resumes/${data.resume.id}`);
                    },
                    onError: (err) => setError(err instanceof ApiClientError ? err.message : '保存失败'),
                  },
                );
              }}
            >
              保存为新版本
            </Button>
            <Button variant="outline" asChild disabled={unverified}>
              <Link to={unverified ? '#' : `/resumes/${resumeId}/print`}>打印 / 导出</Link>
            </Button>
          </div>
          {unverified && (
            <p className="text-destructive text-sm">含未溯源条目时不能导出。请改写或删掉那一条后再试。</p>
          )}
          {error && <p className="text-destructive text-sm">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
