/**
 * @file 【前端·页面】模拟面试
 * /interviews 选岗位、题数、难度和风格。/interviews/:id 用 useChat 把一场文字面试走完。
 * 刷新后 GET 把已落库的轮次填回对话框。开始和续跑发送空 answer，避免把上一轮回答再提交一次。
 */
import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { Loader2, Play, Send, Square } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { Textarea } from '@/frontend/components/ui/textarea';
import { useJobs } from '@/frontend/features/jobs/queries';
import {
  useCreateInterview,
  useFinishInterview,
  useInterview,
  useInterviews,
} from '@/frontend/features/interview/queries';
import { createInterviewTransport } from '@/frontend/features/interview/transport';
import { ApiClientError, parseStreamError } from '@/frontend/lib/api';
import { cn } from '@/frontend/lib/utils';
import {
  INTERVIEW_LIMITS,
  INTERVIEW_STYLES,
  type InterviewProgress,
  type InterviewSettings,
  type InterviewStyle,
  type InterviewView,
} from '@/shared/schemas/interview';

const FIELD =
  'border-input bg-transparent focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-[3px]';

const STYLE_LABEL: Record<InterviewStyle, string> = {
  supportive: '鼓励',
  standard: '标准',
  strict: '严格',
};

const PHASE_LABEL: Record<InterviewProgress['phase'], string> = {
  planning: '准备出题',
  asking: '提问中',
  waiting: '等待回答',
  evaluating: '评估中',
  finished: '已结束',
};

const STATUS_LABEL = { pending: '未开始', running: '进行中', finished: '已结束' } as const;

type InterviewUIMessage = UIMessage<
  never,
  { 'interview-state': InterviewProgress; metrics: { firstTokenMs: number | null; totalMs: number } }
>;

export default function InterviewsPage() {
  const { interviewId } = useParams();
  if (interviewId) return <InterviewSession interviewId={interviewId} />;
  return <InterviewSetup />;
}

function InterviewSetup() {
  const jobs = useJobs();
  const interviews = useInterviews();
  const create = useCreateInterview();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const presetJob = params.get('jobId') ?? '';
  const [jobId, setJobId] = useState(presetJob);
  const [questionCount, setQuestionCount] = useState<number>(INTERVIEW_LIMITS.questionCount.default);
  const [difficultyMin, setDifficultyMin] = useState<number>(2);
  const [difficultyMax, setDifficultyMax] = useState<number>(4);
  const [style, setStyle] = useState<InterviewStyle>('standard');
  const [maxFollowUps, setMaxFollowUps] = useState<number>(INTERVIEW_LIMITS.followUps.default);
  const [error, setError] = useState('');

  const settings: InterviewSettings = { questionCount, difficultyMin, difficultyMax, style, maxFollowUps };
  const invalid = difficultyMin > difficultyMax;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">模拟面试</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          按目标岗位的技能从题库出题。回答太浅会追问，有次数上限。这是练习，不会替你参加真实面试。
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>面试设置</CardTitle>
          <CardDescription>题库按 JD 里的技能标签检索。还没有岗位时，先去解析一份 JD。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm sm:col-span-2">
            <span>目标岗位</span>
            <select className={FIELD} value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">选择岗位</option>
              {jobs.data?.jobs.map(({ job }) => (
                <option key={job.id} value={job.id}>
                  {job.title}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span>题数</span>
            <select
              className={FIELD}
              value={questionCount}
              onChange={(e) => setQuestionCount(Number(e.target.value))}
            >
              {[3, 5, 8, 12].map((n) => (
                <option key={n} value={n}>
                  {n} 题
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span>风格</span>
            <select
              className={FIELD}
              value={style}
              onChange={(e) => setStyle(e.target.value as InterviewStyle)}
            >
              {INTERVIEW_STYLES.map((item) => (
                <option key={item} value={item}>
                  {STYLE_LABEL[item]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span>难度从</span>
            <select
              className={FIELD}
              value={difficultyMin}
              onChange={(e) => setDifficultyMin(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span>难度到</span>
            <select
              className={FIELD}
              value={difficultyMax}
              onChange={(e) => setDifficultyMax(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span>单题最多追问</span>
            <select
              className={FIELD}
              value={maxFollowUps}
              onChange={(e) => setMaxFollowUps(Number(e.target.value))}
            >
              {[0, 1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n} 次
                </option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-2">
            <Button
              disabled={!jobId || invalid || create.isPending}
              onClick={() => {
                setError('');
                create.mutate(
                  { jobId, settings },
                  {
                    onSuccess: (interview) => {
                      void navigate(`/interviews/${interview.id}`);
                    },
                    onError: (err) => setError(err instanceof ApiClientError ? err.message : '创建失败'),
                  },
                );
              }}
            >
              {create.isPending && <Loader2 className="animate-spin" />}
              进入面试
            </Button>
            {invalid && <p className="text-destructive mt-2 text-sm">难度下限不能高于上限</p>}
            {error && <p className="text-destructive mt-2 text-sm">{error}</p>}
            {jobs.data?.jobs.length === 0 && (
              <p className="text-muted-foreground mt-2 text-sm">
                还没有岗位。
                <Link to="/jobs" className="underline">
                  先去解析 JD
                </Link>
              </p>
            )}
          </div>
        </CardContent>
      </Card>
      <div className="space-y-3">
        {interviews.data?.interviews.map((item) => (
          <Card key={item.id}>
            <CardHeader>
              <CardTitle className="text-base">
                <Link to={`/interviews/${item.id}`} className="hover:underline">
                  {item.jobTitle}
                </Link>
              </CardTitle>
              <CardDescription>
                {STYLE_LABEL[item.settings.style]} · {item.settings.questionCount} 题 · 难度{' '}
                {item.settings.difficultyMin}–{item.settings.difficultyMax}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant={item.status === 'finished' ? 'secondary' : 'outline'}>
                {STATUS_LABEL[item.status]}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function InterviewSession({ interviewId }: { interviewId: string }) {
  const interview = useInterview(interviewId);
  if (interview.isPending) return <Loader2 className="text-muted-foreground size-5 animate-spin" />;
  if (interview.isError) {
    return <p className="text-destructive text-sm">{interview.error.message}</p>;
  }
  if (!interview.data) return <p className="text-sm">找不到这场面试。</p>;
  return <InterviewChat key={interviewId} interview={interview.data} />;
}

function InterviewChat({ interview }: { interview: InterviewView }) {
  const [progress, setProgress] = useState(interview.progress);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const finish = useFinishInterview(interview.id);
  const [{ transport, sendEmpty }] = useState(() => createInterviewTransport(interview.id));
  const initialMessages = useMemo<InterviewUIMessage[]>(
    () =>
      interview.turns.map((turn) => ({
        id: turn.id,
        role: turn.role,
        parts: [{ type: 'text', text: turn.content }],
      })),
    [interview.turns],
  );

  const { messages, sendMessage, status, error, stop, clearError } = useChat<InterviewUIMessage>({
    id: interview.id,
    messages: initialMessages,
    transport,
    onData: (part) => {
      if (part.type === 'data-interview-state') setProgress(part.data);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const busy = status === 'submitted' || status === 'streaming';
  const liveProgress = finish.data?.progress ?? progress;
  const finished = liveProgress.phase === 'finished' || liveProgress.status === 'finished';
  const waiting = liveProgress.phase === 'waiting';
  const showStart = !finished && messages.length === 0 && !busy;
  const showContinue = !finished && !waiting && !showStart && messages.at(-1)?.role === 'user' && !busy;
  const streamErr = parseStreamError(error);
  const questionNo = Math.min(liveProgress.cursor + 1, Math.max(liveProgress.total, 1));

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
  const kickOff = () => {
    sendEmpty();
    clearError();
    void sendMessage();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{interview.jobTitle}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {STYLE_LABEL[interview.settings.style]}风格 · 难度 {interview.settings.difficultyMin}–
            {interview.settings.difficultyMax} · 模拟练习，由模型生成
          </p>
        </div>
        {!finished && messages.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy || finish.isPending}
            onClick={() => finish.mutate()}
          >
            结束面试
          </Button>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
        <Card className="min-h-[480px]">
          <CardContent className="flex flex-1 flex-col gap-3">
            {showStart && (
              <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 py-16 text-sm">
                <p>准备好后开始。题目会按这个岗位的技能抽出来。</p>
                <Button onClick={kickOff} disabled={busy}>
                  <Play />
                  开始
                </Button>
              </div>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}
              >
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
            ))}
            {showContinue && (
              <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                <span className="text-muted-foreground">上一轮还没完成，回答已经保存。</span>
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
              </div>
            )}
            {finish.isError && <p className="text-destructive text-sm">{finish.error.message}</p>}
            <div ref={bottomRef} />
          </CardContent>
          {!showStart && (
            <div className="flex items-end gap-2 border-t px-5 pt-4">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={finished ? '这场面试已经结束' : '输入回答，Enter 发送，Shift+Enter 换行'}
                disabled={finished || !waiting}
                rows={2}
                className="resize-none"
              />
              {busy ? (
                <Button variant="outline" size="icon" onClick={() => void stop()} aria-label="停止">
                  <Square />
                </Button>
              ) : (
                <Button
                  size="icon"
                  onClick={submit}
                  disabled={!input.trim() || finished || !waiting}
                  aria-label="发送"
                >
                  <Send />
                </Button>
              )}
            </div>
          )}
        </Card>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-sm">本场进度</CardTitle>
            <CardDescription>{interview.jobTitle}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="阶段">
              <Badge variant={finished ? 'secondary' : 'outline'}>{PHASE_LABEL[liveProgress.phase]}</Badge>
            </Row>
            <Row label="题目">{liveProgress.total > 0 ? `${questionNo} / ${liveProgress.total}` : '-'}</Row>
            <Row label="本题追问">
              {liveProgress.followUpCount} / {liveProgress.maxFollowUps}
            </Row>
            <Row label="风格">{STYLE_LABEL[interview.settings.style]}</Row>
            <Row label="难度">
              {interview.settings.difficultyMin}–{interview.settings.difficultyMax}
            </Row>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span>{children}</span>
    </div>
  );
}
