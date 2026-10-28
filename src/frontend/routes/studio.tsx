/**
 * @file 【前端·页面】简历策划
 * /studio 新建一场，也可以接着上次的策划，或删掉一场。
 * /studio/:id 左边对话，右边预览。退出只离开页面，这场策划留在列表里。
 * 简历更新走 data-studio-resume。Agent 步骤走 data-studio-trace，挂在当次助手回复下面，刷新后从详情里的 traces 恢复。
 */
import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { Loader2, Play, Send, Square } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { Input } from '@/frontend/components/ui/input';
import { Textarea } from '@/frontend/components/ui/textarea';
import { useCreateStudio, useDeleteStudio, useStudio, useStudios } from '@/frontend/features/studio/queries';
import { StudioSheet } from '@/frontend/features/studio/sheet';
import { StudioTrace } from '@/frontend/features/studio/trace';
import { placeStudioRuns } from '@/frontend/features/studio/trace-runs';
import { createStudioTransport } from '@/frontend/features/studio/transport';
import { parseStreamError } from '@/frontend/lib/api';
import { cn } from '@/frontend/lib/utils';
import type { AppErrorCode } from '@/shared/common/errors';
import {
  emptyStudioDocument,
  type StudioDocument,
  type StudioFocus,
  type StudioResumeEvent,
  type StudioStatus,
  type StudioTraceStep,
  type StudioView,
} from '@/shared/schemas/studio';

const RETRYABLE_CODES: AppErrorCode[] = [
  'RATE_LIMITED',
  'LLM_TIMEOUT',
  'LLM_UNAVAILABLE',
  'LLM_SCHEMA_INVALID',
  'INTERNAL',
];

type StudioUIMessage = UIMessage<
  never,
  {
    'studio-resume': StudioResumeEvent;
    'studio-trace': { step: StudioTraceStep };
    metrics: { firstTokenMs: number | null; totalMs: number };
  }
>;

const STATUS_LABEL: Record<StudioStatus, string> = {
  active: '进行中',
  ready: '可以导出',
};

export default function StudioPage() {
  const { studioId } = useParams();
  if (studioId) return <StudioSession studioId={studioId} />;
  return <StudioList />;
}

function StudioList() {
  const studios = useStudios();
  const create = useCreateStudio();
  const remove = useDeleteStudio();
  const navigate = useNavigate();
  const [title, setTitle] = useState('未命名策划');
  const [deleteError, setDeleteError] = useState('');

  const onDelete = (id: string, name: string) => {
    if (!window.confirm(`删除「${name}」？对话和当前简历都会去掉，不能恢复。`)) return;
    setDeleteError('');
    void remove.mutateAsync(id).catch((error: Error) => setDeleteError(error.message));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">简历策划</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          告诉策划师目标岗位和经历，右边会跟着改。满意后说「可以了」，再导出 PDF。退出会留着这场策划，下次点「继续」接着聊。
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>新开一场</CardTitle>
          <CardDescription>标题只是给你自己看，比如「高级前端 · 某公司」。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Input value={title} maxLength={40} onChange={(e) => setTitle(e.target.value)} />
          <Button
            disabled={create.isPending || !title.trim()}
            onClick={() => {
              void create.mutateAsync({ title: title.trim() }).then((created) => {
                void navigate(`/studio/${created.id}`);
              });
            }}
          >
            {create.isPending && <Loader2 className="animate-spin" />}
            开始策划
          </Button>
        </CardContent>
        {create.isError && <p className="text-destructive px-6 pb-4 text-sm">{create.error.message}</p>}
      </Card>
      {studios.isPending && <Loader2 className="text-muted-foreground size-5 animate-spin" />}
      {studios.isError && <p className="text-destructive text-sm">{studios.error.message}</p>}
      {deleteError && <p className="text-destructive text-sm">{deleteError}</p>}
      {studios.data && studios.data.studios.length === 0 && (
        <p className="text-muted-foreground text-sm">还没有策划。新开一场之后，退出也会留在这里。</p>
      )}
      <div className="grid gap-3">
        {studios.data?.studios.map((studio) => (
          <Card key={studio.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {studio.title}
                <Badge variant={studio.status === 'ready' ? 'secondary' : 'outline'}>
                  {STATUS_LABEL[studio.status]}
                </Badge>
              </CardTitle>
              <CardDescription>
                {studio.targetRole || '还没定岗位'} · {new Date(studio.updatedAt).toLocaleString()}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button size="sm" asChild>
                <Link to={`/studio/${studio.id}`}>继续</Link>
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={remove.isPending}
                onClick={() => onDelete(studio.id, studio.title)}
              >
                删除
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function StudioSession({ studioId }: { studioId: string }) {
  const studio = useStudio(studioId);
  if (studio.isPending) return <Loader2 className="text-muted-foreground size-5 animate-spin" />;
  if (studio.isError) return <p className="text-destructive text-sm">{studio.error.message}</p>;
  if (!studio.data) return <p className="text-sm">找不到这场策划。</p>;
  return <StudioChat key={studioId} studio={studio.data} />;
}

function StudioChat({ studio }: { studio: StudioView }) {
  const navigate = useNavigate();
  const remove = useDeleteStudio();
  const [deleteError, setDeleteError] = useState('');
  const [document, setDocument] = useState<StudioDocument>(studio.document);
  const [focus, setFocus] = useState<StudioFocus>(studio.focus);
  const [liveStatus, setLiveStatus] = useState<StudioStatus>(studio.status);
  const [targetRole, setTargetRole] = useState(studio.targetRole);
  const [waiting, setWaiting] = useState(studio.waiting);
  const [started, setStarted] = useState(studio.started);
  const [input, setInput] = useState('');
  const [traces, setTraces] = useState<StudioTraceStep[]>(studio.traces);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [{ transport, sendEmpty }] = useState(() => createStudioTransport(studio.id));
  const initialMessages = useMemo<StudioUIMessage[]>(
    () =>
      studio.turns.map((turn) => ({
        id: turn.id,
        role: turn.role,
        parts: [{ type: 'text', text: turn.content }],
      })),
    [studio.turns],
  );

  const { messages, sendMessage, status, error, stop, clearError } = useChat<StudioUIMessage>({
    id: studio.id,
    messages: initialMessages,
    transport,
    onData: (part) => {
      if (part.type === 'data-studio-resume') {
        setDocument(part.data.document ?? emptyStudioDocument());
        setFocus(part.data.focus);
        setLiveStatus(part.data.status);
        setTargetRole(part.data.targetRole);
        return;
      }
      if (part.type !== 'data-studio-trace') return;
      const step = part.data.step;
      setTraces((prev) => {
        const index = prev.findIndex((item) => item.id === step.id);
        if (index < 0) return [...prev, step];
        const next = prev.slice();
        next[index] = step;
        return next;
      });
    },
    onFinish: () => setWaiting(true),
    onError: () => {
      setWaiting(false);
      setTraces((prev) =>
        prev.map((step) =>
          step.status === 'running'
            ? { ...step, status: 'error', note: step.note ?? '这一步没有完成。' }
            : step,
        ),
      );
    },
  });

  const busy = status === 'submitted' || status === 'streaming';
  const transcript = useMemo(() => {
    const assistantCount = messages.filter((message) => message.role === 'assistant').length;
    const last = messages.at(-1);
    const placed = placeStudioRuns(traces, assistantCount, busy && last?.role === 'assistant');
    const rows = messages.map((message, index) => {
      if (message.role !== 'assistant') return { message, steps: [], live: false };
      const assistantIndex = messages
        .slice(0, index)
        .filter((item) => item.role === 'assistant').length;
      const steps = placed.byAssistant[assistantIndex] ?? [];
      const live = busy && message.id === last?.id && steps.some((step) => step.status === 'running');
      return { message, steps, live };
    });
    return { rows, trailing: placed.pending, trailingLive: busy && placed.pending.length > 0 };
  }, [messages, traces, busy]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, traces]);
  const showStart = !started && messages.length === 0 && !busy;
  const showContinue = started && !waiting && !busy && !showStart;
  const streamErr = parseStreamError(error);

  const submit = () => {
    const text = input.trim();
    if (!text || busy || !waiting) return;
    setInput('');
    setWaiting(false);
    void sendMessage({ text });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };
  const kickOff = () => {
    setStarted(true);
    setWaiting(false);
    sendEmpty();
    clearError();
    void sendMessage();
  };
  const exit = () => {
    if (busy) void stop();
    void navigate('/studio');
  };
  const onDelete = () => {
    if (!window.confirm(`删除「${studio.title}」？对话和当前简历都会去掉，不能恢复。`)) return;
    if (busy) void stop();
    setDeleteError('');
    void remove.mutateAsync(studio.id).then(
      () => navigate('/studio'),
      (error: Error) => setDeleteError(error.message),
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{studio.title}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {targetRole || '还没定岗位'} · 策划师一次只问一个缺口，或改一节简历
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={liveStatus === 'ready' ? 'secondary' : 'outline'}>{STATUS_LABEL[liveStatus]}</Badge>
          {liveStatus === 'ready' ? (
            <Button size="sm" asChild>
              <Link to={`/studio/${studio.id}/print`}>导出 PDF</Link>
            </Button>
          ) : (
            <Button size="sm" disabled>
              导出 PDF
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={exit}>
            退出
          </Button>
          <Button size="sm" variant="outline" disabled={remove.isPending} onClick={onDelete}>
            删除
          </Button>
        </div>
      </div>
      {deleteError && <p className="text-destructive text-sm">{deleteError}</p>}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card className="min-h-[520px]">
          <CardContent className="flex flex-1 flex-col gap-3">
            {showStart && (
              <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 py-16 text-sm">
                <p>策划师会先问你想应聘的岗位。</p>
                <Button onClick={kickOff} disabled={busy}>
                  <Play />
                  开始
                </Button>
              </div>
            )}
            {transcript.rows.map(({ message, steps, live }) => (
              <div key={message.id} className="space-y-1.5">
                <div className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div
                    className={cn(
                      'max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
                      message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted',
                    )}
                  >
                    {message.parts.map((part, index) =>
                      part.type === 'text' ? <p key={index}>{part.text}</p> : null,
                    )}
                  </div>
                </div>
                {steps.length > 0 && (
                  <div className="flex justify-start">
                    <StudioTrace steps={steps} busy={live} />
                  </div>
                )}
              </div>
            ))}
            {transcript.trailing.length > 0 && (
              <div className="flex justify-start">
                <StudioTrace steps={transcript.trailing} busy={transcript.trailingLive} />
              </div>
            )}
            {showContinue && (
              <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                <span className="text-muted-foreground">上一轮还没完成。</span>
                <Button size="sm" variant="outline" onClick={kickOff}>
                  继续
                </Button>
              </div>
            )}
            {status === 'submitted' && <Loader2 className="text-muted-foreground size-4 animate-spin" />}
            {streamErr && (
              <div className="border-destructive/30 bg-destructive/5 flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                <span className="text-destructive">
                  {streamErr.message}（{streamErr.code}）
                </span>
                {RETRYABLE_CODES.includes(streamErr.code) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      clearError();
                      kickOff();
                    }}
                  >
                    重试
                  </Button>
                )}
              </div>
            )}
            <div ref={bottomRef} />
          </CardContent>
          {!showStart && (
            <div className="flex items-end gap-2 border-t px-5 pt-4">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={waiting ? '输入回复，Enter 发送，Shift+Enter 换行' : '等策划师说完再回复'}
                disabled={!waiting || busy}
                rows={3}
                className="resize-none"
              />
              {busy ? (
                <Button variant="outline" size="icon" onClick={() => void stop()} aria-label="停止">
                  <Square />
                </Button>
              ) : (
                <Button size="icon" onClick={submit} disabled={!input.trim() || !waiting} aria-label="发送">
                  <Send />
                </Button>
              )}
            </div>
          )}
        </Card>
        <div className="space-y-2">
          <StudioSheet document={document} focus={focus} mode="edit" />
          <p className="text-muted-foreground text-xs">
            {liveStatus === 'ready'
              ? '可以导出了。还想改的话，直接在左边说。'
              : '说「可以了」之后才能导出 PDF。'}
          </p>
        </div>
      </div>
    </div>
  );
}
