/**
 * @file 【前端·组件】策划简历纸
 * 对话页和打印页共用。编辑态空栏留占位；打印态省略没填的联系方式和空栏目。
 */
import type { ReactNode } from 'react';
import { cn } from '@/frontend/lib/utils';
import type { StudioDocument, StudioFocus } from '@/shared/schemas/studio';

function period(start: string, end: string): string {
  if (!start && !end) return '';
  return `${start || '—'} – ${end || '至今'}`;
}

function Mark({
  active,
  mode,
  children,
  className,
}: {
  active: boolean;
  mode: 'edit' | 'print';
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        className,
        mode === 'edit' && active && 'ring-primary/30 rounded-md bg-sky-50 px-2 py-1 ring-2',
      )}
    >
      {children}
    </div>
  );
}

function Placeholder({ children }: { children: string }) {
  return <span className="text-neutral-400">{children}</span>;
}

export function StudioSheet({
  document,
  focus,
  mode,
}: {
  document: StudioDocument;
  focus?: StudioFocus;
  mode: 'edit' | 'print';
}) {
  const { basics } = document;
  const contact = [basics.phone, basics.email, basics.location].filter(Boolean).join(' · ');
  const experiences = document.experiences.filter(
    (item) => item.org || item.title || item.bullets.length > 0,
  );
  const projects = document.projects.filter((item) => item.name || item.bullets.length > 0);
  const education = document.education.filter(
    (item) => item.school || item.degree || item.bullets.length > 0,
  );

  return (
    <article
      className={cn(
        'resume-sheet bg-white text-sm leading-6 text-neutral-900',
        mode === 'print' ? 'mx-auto max-w-[210mm] px-8 py-10' : 'rounded-md px-5 py-6 shadow-sm',
      )}
    >
      <Mark active={focus === 'basics'} mode={mode}>
        {basics.name || mode === 'edit' ? (
          <h2 className="text-2xl font-semibold">{basics.name || <Placeholder>姓名</Placeholder>}</h2>
        ) : null}
        {basics.headline || mode === 'edit' ? (
          <p className="mt-1">{basics.headline || <Placeholder>目标岗位</Placeholder>}</p>
        ) : null}
        {contact || mode === 'edit' ? (
          <p className="mt-1 text-neutral-600">{contact || <Placeholder>电话、邮箱、城市</Placeholder>}</p>
        ) : null}
      </Mark>

      {(document.summary || mode === 'edit') && (
        <Mark active={focus === 'summary'} mode={mode} className="mt-4">
          <h3 className="border-b border-neutral-200 pb-1 text-xs font-semibold tracking-wide">摘要</h3>
          <p className="mt-2">{document.summary || <Placeholder>摘要会在对话后出现在这里</Placeholder>}</p>
        </Mark>
      )}

      {(document.skills.length > 0 || mode === 'edit') && (
        <Mark active={focus === 'skills'} mode={mode} className="mt-4">
          <h3 className="border-b border-neutral-200 pb-1 text-xs font-semibold tracking-wide">技能</h3>
          {document.skills.length > 0 ? (
            <p className="mt-2">{document.skills.join(' · ')}</p>
          ) : (
            <p className="mt-2">
              <Placeholder>技能</Placeholder>
            </p>
          )}
        </Mark>
      )}

      {(experiences.length > 0 || mode === 'edit') && (
        <Mark active={focus === 'experience'} mode={mode} className="mt-4">
          <h3 className="border-b border-neutral-200 pb-1 text-xs font-semibold tracking-wide">工作经历</h3>
          {experiences.length === 0 && (
            <p className="mt-2">
              <Placeholder>经历会随着对话出现</Placeholder>
            </p>
          )}
          {experiences.map((item, index) => (
            <section key={`${item.org}-${index}`} className="mt-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">
                  {[item.org || (mode === 'edit' ? '公司' : ''), item.title].filter(Boolean).join(' · ')}
                </p>
                {period(item.start, item.end) && (
                  <p className="text-xs text-neutral-500">{period(item.start, item.end)}</p>
                )}
              </div>
              {item.bullets.length > 0 && (
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {item.bullets.map((bullet, bulletIndex) => (
                    <li key={bulletIndex}>{bullet}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </Mark>
      )}

      {(projects.length > 0 || (mode === 'edit' && focus === 'projects')) && (
        <Mark active={focus === 'projects'} mode={mode} className="mt-4">
          <h3 className="border-b border-neutral-200 pb-1 text-xs font-semibold tracking-wide">项目</h3>
          {projects.map((item, index) => (
            <section key={`${item.name}-${index}`} className="mt-3">
              {item.name && <p className="font-medium">{item.name}</p>}
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {item.bullets.map((bullet, bulletIndex) => (
                  <li key={bulletIndex}>{bullet}</li>
                ))}
              </ul>
            </section>
          ))}
        </Mark>
      )}

      {(education.length > 0 || (mode === 'edit' && focus === 'education')) && (
        <Mark active={focus === 'education'} mode={mode} className="mt-4">
          <h3 className="border-b border-neutral-200 pb-1 text-xs font-semibold tracking-wide">教育</h3>
          {education.map((item, index) => (
            <section key={`${item.school}-${index}`} className="mt-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">{[item.school, item.degree].filter(Boolean).join(' · ')}</p>
                {period(item.start, item.end) && (
                  <p className="text-xs text-neutral-500">{period(item.start, item.end)}</p>
                )}
              </div>
            </section>
          ))}
        </Mark>
      )}
    </article>
  );
}
