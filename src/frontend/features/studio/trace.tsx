/**
 * @file 【前端·组件】策划 Agent 运行记录
 * 挂在当次助手回复下面。整段默认收起，展开后再看每一步的输入和输出。
 */
import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/frontend/components/ui/badge';
import type { StudioTraceKind, StudioTraceStep, StudioTraceStatus } from '@/shared/schemas/studio';

const KIND_LABEL: Record<StudioTraceKind, string> = {
  observe: '观察',
  think: '思考',
  model: '模型',
  tool: '工具',
};

const STATUS_LABEL: Record<StudioTraceStatus, string> = {
  running: '进行中',
  ok: '完成',
  error: '失败',
};

function usageLine(step: StudioTraceStep): string {
  return [
    step.latencyMs != null ? `${step.latencyMs} ms` : '',
    step.inputTokens != null ? `输入 ${step.inputTokens} token` : '',
    step.outputTokens != null ? `输出 ${step.outputTokens} token` : '',
    step.attempts != null && step.attempts > 1 ? `调用 ${step.attempts} 次` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function identityLine(step: StudioTraceStep): string {
  return [step.alias, step.provider, step.model, step.method, step.functionId, step.promptVersion]
    .filter(Boolean)
    .join(' · ');
}

function Disclosure({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <details className="rounded-md border">
      <summary className="cursor-pointer px-3 py-2 text-sm">{title}</summary>
      <div className="space-y-2 border-t px-3 py-2">{children}</div>
    </details>
  );
}

function TextBlock({ label, text }: { label: string; text: string }) {
  return (
    <details>
      <summary className="text-muted-foreground cursor-pointer text-xs">{label}</summary>
      <pre className="bg-muted mt-1 max-h-64 overflow-auto rounded-md p-2 text-xs leading-relaxed whitespace-pre-wrap break-words">
        {text}
      </pre>
    </details>
  );
}

export function StudioTrace({ steps, busy }: { steps: StudioTraceStep[]; busy: boolean }) {
  if (steps.length === 0) return null;
  const failed = steps.some((step) => step.status === 'error');
  return (
    <details data-testid="studio-trace" className="w-full max-w-[85%] rounded-md border">
      <summary className="text-muted-foreground flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs">
        <span>Agent 运行 · {steps.length} 步</span>
        {failed && <Badge variant="destructive">失败</Badge>}
        {busy && <Loader2 className="size-3.5 animate-spin" />}
      </summary>
      <div className="max-h-80 space-y-2 overflow-auto border-t px-3 py-2">
        {steps.map((step) => {
          const usage = usageLine(step);
          const identity = identityLine(step);
          return (
            <Disclosure
              key={step.id}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant={step.kind === 'model' ? 'default' : 'outline'}>{KIND_LABEL[step.kind]}</Badge>
                  <span className="font-medium">{step.title}</span>
                  <Badge
                    variant={
                      step.status === 'error' ? 'destructive' : step.status === 'ok' ? 'success' : 'secondary'
                    }
                  >
                    {STATUS_LABEL[step.status]}
                  </Badge>
                </span>
              }
            >
              {identity && <p className="text-muted-foreground font-mono text-xs">{identity}</p>}
              {usage && <p className="text-muted-foreground font-mono text-xs">{usage}</p>}
              {step.note && <p className="text-sm leading-relaxed">{step.note}</p>}
              {step.input && <TextBlock label="输入" text={step.input} />}
              {step.output && <TextBlock label="输出" text={step.output} />}
            </Disclosure>
          );
        })}
      </div>
    </details>
  );
}
