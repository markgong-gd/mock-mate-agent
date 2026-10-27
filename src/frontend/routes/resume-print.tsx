/**
 * @file 【前端·页面】打印简历
 * 数据来自 GET /api/resumes/:id/export。含未溯源条目时接口返回 409，本页不渲染正文。
 * 联系方式来自档案，不来自模型。排版用浏览器打印，避免在服务端嵌中文字体。
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Button } from '@/frontend/components/ui/button';
import { api } from '@/frontend/lib/api';
import { ApiClientError } from '@/frontend/lib/api';

interface ExportPayload {
  resume: {
    content: {
      headline: string;
      summary: string;
      sections: { heading: string; bullets: { text: string }[] }[];
    };
  };
  contact: { name: string; phone: string; email: string };
}

export default function ResumePrintPage() {
  const { resumeId = '' } = useParams();
  const [data, setData] = useState<ExportPayload | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await api.resumes[':id'].export.$get({ param: { id: resumeId } });
      if (cancelled) return;
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null);
        const message =
          body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
            ? body.message
            : '无法导出';
        setError(message);
        return;
      }
      setData((await res.json()) as ExportPayload);
    })().catch((err: unknown) => {
      if (!cancelled) setError(err instanceof ApiClientError ? err.message : '无法导出');
    });
    return () => {
      cancelled = true;
    };
  }, [resumeId]);

  if (error) return <p className="text-destructive text-sm">{error}</p>;
  if (!data) return <p className="text-muted-foreground text-sm">准备打印稿…</p>;
  const { contact, resume } = data;
  return (
    <article className="resume-sheet mx-auto max-w-[210mm] bg-white text-neutral-900">
      <div className="mb-4 flex justify-end print:hidden">
        <Button onClick={() => window.print()}>打印</Button>
      </div>
      <header className="border-b border-neutral-300 pb-4">
        <h1 className="text-3xl font-semibold">{contact.name || '未填写姓名'}</h1>
        <p className="mt-1 text-sm">{resume.content.headline}</p>
        <p className="mt-1 text-sm text-neutral-600">
          {[contact.phone, contact.email].filter(Boolean).join(' · ') || '未填写联系方式'}
        </p>
      </header>
      <p className="mt-4 text-sm leading-6">{resume.content.summary}</p>
      {resume.content.sections.map((section, sectionIndex) => (
        <section key={`${section.heading}-${sectionIndex}`} className="mt-5">
          <h2 className="border-b border-neutral-200 pb-1 text-sm font-semibold tracking-wide">
            {section.heading}
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6">
            {section.bullets.map((bullet, bulletIndex) => (
              <li key={`${sectionIndex}-${bulletIndex}`}>{bullet.text}</li>
            ))}
          </ul>
        </section>
      ))}
      <p className="mt-8 text-[11px] text-neutral-500">
        本简历由 MockMate 根据你确认过的事实生成，请核对后再投递。
      </p>
    </article>
  );
}
