/**
 * @file 【前端·页面】回声图调试页（/dev/echo）
 * 做什么：与后端 LangGraph 回声图进行流式多轮对话，验证逐字流式、中断恢复、存档恢复。
 * 怎么工作：useEchoThread 从存档拉取历史 → useChat + createAnswerTransport 发送本轮回答 →
 *          接收 UI Message Stream（文本逐字 + data-echo-state 进度 + data-metrics 耗时）。
 * 这是未来"模拟面试"页面的样板。
 */
import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { ExternalLink, Loader2, Play, RotateCcw, Send, Square } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { Textarea } from '@/frontend/components/ui/textarea';
import { useEchoThread } from '@/frontend/features/dev-echo/queries';
import { parseStreamError } from '@/frontend/lib/api';
import { createAnswerTransport } from '@/frontend/lib/chat-transport';
import { cn } from '@/frontend/lib/utils';

interface EchoProgress {
  round: number;
  maxRounds: number;
  phase: 'asking' | 'waiting' | 'replying' | 'finished' | string;
}
interface Metrics {
  firstTokenMs: number | null;
  totalMs: number;
}
type EchoUIMessage = UIMessage<
  never,
  { 'echo-state': EchoProgress; metrics: Metrics; run: { mode: string } }
>;

const STORAGE_KEY = 'mm.dev.echo.threadId';
const newThreadId = () =>
  `echo-${typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;

const PHASE_LABEL: Record<string, string> = {
  asking: '提问中',
  waiting: '等待回答',
  replying: '点评中',
  finished: '已结束',
};

export default function DevEchoPage() {
  const [threadId, setThreadId] = useState(() => localStorage.getItem(STORAGE_KEY) ?? newThreadId());
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, threadId);
  }, [threadId]);
  const thread = useEchoThread(threadId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">回声图（调试）</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            ask → wait_answer(interrupt) → reply。刷新页面或重启后端进程后，对话从 PostgresSaver 存档恢复。
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/dev/threads/${threadId}/state`} target="_blank" rel="noreferrer">
              <ExternalLink />
              存档状态
            </a>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setThreadId(newThreadId())}>
            <RotateCcw />
            新会话
          </Button>
        </div>
      </div>

      {thread.isPending && <Loader2 className="text-muted-foreground size-5 animate-spin" />}
      {thread.isError && <p className="text-destructive text-sm">加载存档失败：{thread.error.message}</p>}
      {thread.data && (
        <EchoChat
          key={threadId}
          threadId={threadId}
          initialMessages={thread.data.messages as EchoUIMessage[]}
          initialProgress={{
            round: thread.data.round,
            maxRounds: thread.data.maxRounds,
            phase:
              thread.data.status === 'finished'
                ? 'finished'
                : thread.data.next.includes('wait_answer')
                  ? 'waiting'
                  : 'asking',
          }}
          started={thread.data.exists}
        />
      )}
    </div>
  );
}

function EchoChat(props: {
  threadId: string;
  initialMessages: EchoUIMessage[];
  initialProgress: EchoProgress;
  started: boolean;
}) {
  const [progress, setProgress] = useState<EchoProgress>(props.initialProgress);
  const [metrics, setMetrics] = useState<Metrics[]>([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const { transport, sendEmpty } = useMemo(
    () => createAnswerTransport(`/api/dev/echo/${props.threadId}/chat`),
    [props.threadId],
  );

  const { messages, sendMessage, status, error, stop, clearError } = useChat<EchoUIMessage>({
    id: props.threadId,
    messages: props.initialMessages,
    transport,
    onData: (part) => {
      if (part.type === 'data-echo-state') setProgress(part.data);
      if (part.type === 'data-metrics') setMetrics((m) => [...m, part.data]);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const busy = status === 'submitted' || status === 'streaming';
  const finished = progress.phase === 'finished';
  const notStarted = !props.started && messages.length === 0;
  const streamErr = parseStreamError(error);

  const kickOff = () => {
    sendEmpty();
    clearError();
    void sendMessage();
  };
  const submit = () => {
    const text = input.trim();
    if (!text || busy || finished) return;
    setInput('');
    void sendMessage({ text });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };
  const last = metrics.at(-1);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
      <Card className="min-h-[480px]">
        <CardContent className="flex flex-1 flex-col gap-3">
          {notStarted && (
            <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 py-16 text-sm">
              <p>新会话，点击开始后由面试官提出第一个问题。</p>
              <Button onClick={kickOff} disabled={busy}>
                <Play />
                开始
              </Button>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[85%] space-y-1.5 rounded-lg px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
                  m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted',
                )}
              >
                {m.parts.map((p, i) => (p.type === 'text' ? <p key={i}>{p.text}</p> : null))}
              </div>
            </div>
          ))}
          {status === 'submitted' && <Loader2 className="text-muted-foreground size-4 animate-spin" />}
          {streamErr && (
            <div className="border-destructive/30 bg-destructive/5 flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
              <span className="text-destructive">
                {streamErr.message}（{streamErr.code}）
              </span>
              {progress.phase === 'waiting' && messages.at(-1)?.role !== 'user' ? (
                <span className="text-muted-foreground">请在下方输入回答后发送</span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    clearError();
                    if (messages.at(-1)?.role === 'user') void sendMessage();
                    else kickOff();
                  }}
                >
                  重试
                </Button>
              )}
            </div>
          )}
          <div ref={bottomRef} />
        </CardContent>
        {!notStarted && (
          <div className="flex items-end gap-2 border-t px-5 pt-4">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={
                finished ? '本场已结束，点击右上角“新会话”' : '输入你的回答，Enter 发送，Shift+Enter 换行'
              }
              disabled={finished}
              rows={2}
              className="resize-none"
            />
            {busy ? (
              <Button variant="outline" size="icon" onClick={() => void stop()} aria-label="停止">
                <Square />
              </Button>
            ) : (
              <Button size="icon" onClick={submit} disabled={!input.trim() || finished} aria-label="发送">
                <Send />
              </Button>
            )}
          </div>
        )}
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-sm">运行状态</CardTitle>
          <CardDescription className="font-mono text-[11px] break-all">{props.threadId}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="阶段">
            <Badge variant={finished ? 'secondary' : 'outline'}>
              {PHASE_LABEL[progress.phase] ?? progress.phase}
            </Badge>
          </Row>
          <Row label="轮次">
            {progress.round} / {progress.maxRounds || '-'}
          </Row>
          <Row label="流状态">{status}</Row>
          <Row label="首字延迟">{last?.firstTokenMs != null ? `${last.firstTokenMs} ms` : '-'}</Row>
          <Row label="本轮耗时">{last ? `${last.totalMs} ms` : '-'}</Row>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{children}</span>
    </div>
  );
}
