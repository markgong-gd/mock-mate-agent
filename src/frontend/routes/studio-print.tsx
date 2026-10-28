/**
 * @file 【前端·页面】打印策划简历
 * 数据来自 GET /api/studio/:id/export。用浏览器「另存为 PDF」，不在服务端嵌中文字体。
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Button } from '@/frontend/components/ui/button';
import { StudioSheet } from '@/frontend/features/studio/sheet';
import { ApiClientError, api } from '@/frontend/lib/api';
import type { StudioExport } from '@/shared/schemas/studio';

export default function StudioPrintPage() {
  const { studioId = '' } = useParams();
  const [data, setData] = useState<StudioExport | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await api.studio[':id'].export.$get({ param: { id: studioId } });
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
      setData((await res.json()) as StudioExport);
    })().catch((err: unknown) => {
      if (!cancelled) setError(err instanceof ApiClientError ? err.message : '无法导出');
    });
    return () => {
      cancelled = true;
    };
  }, [studioId]);

  if (error) return <p className="text-destructive text-sm">{error}</p>;
  if (!data) return <p className="text-muted-foreground text-sm">准备打印稿…</p>;
  return (
    <div>
      <div className="mb-4 flex justify-end print:hidden">
        <Button onClick={() => window.print()}>导出 PDF</Button>
      </div>
      <StudioSheet document={data.document} mode="print" />
      <p className="mx-auto mt-6 max-w-[210mm] text-[11px] text-neutral-500 print:mt-8">
        本简历由策划对话整理，请核对公司和数字后再投递。
      </p>
    </div>
  );
}
