/**
 * @file 【前端·组件】简历预览
 * 生成过程中的半截 JSON 和已落库的完整简历都用这一份。未溯源的条目用虚线标出。
 */
import { Badge } from '@/frontend/components/ui/badge';

export interface ResumePreviewData {
  headline?: string;
  summary?: string;
  /** 流式解析时数组里可能暂时是 undefined */
  sections?: (
    | {
        heading?: string;
        bullets?: (
          { text?: string; status?: 'verified' | 'unverified'; factRefs?: (string | undefined)[] } | undefined
        )[];
      }
    | undefined
  )[];
}

export function ResumePreview({ content }: { content: ResumePreviewData | undefined }) {
  if (!content) return <p className="text-muted-foreground text-sm">生成开始后，简历会在这里逐段出现。</p>;
  return (
    <div className="space-y-4">
      {content.headline && <h2 className="text-xl font-semibold">{content.headline}</h2>}
      {content.summary && <p className="text-sm leading-6">{content.summary}</p>}
      {content.sections?.map((section, index) => (
        <section key={`${section?.heading ?? 'section'}-${index}`}>
          {section?.heading && <h3 className="mb-2 text-sm font-medium">{section.heading}</h3>}
          <ul className="space-y-2">
            {section?.bullets?.map((bullet, bulletIndex) => (
              <li key={bulletIndex} className="text-sm leading-6">
                <span>{bullet?.text}</span>
                {bullet?.status === 'unverified' && (
                  <Badge variant="destructive" className="ml-2">
                    未溯源
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
