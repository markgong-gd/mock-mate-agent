/**
 * @file 【前端·页面】诊断报告
 * /reports 列出历史报告；/reports/:reportId 展示雷达图 + 逐题点评 + 短板证据 + 复训计划 + Rubric 版本。
 * 报告是异步生成的，pending / running 期间由 queries 里的轮询刷新，失败后可以点重试。
 * 每条短板和每条复训计划都能一键开专项训练（R-C2-5），底部还有这一场的 Token 与成本（N-12）。
 */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AlertTriangle, BarChart3, Dumbbell, Loader2, RotateCcw, Wallet } from 'lucide-react';
import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import {
  useCreateTraining,
  useReport,
  useReports,
  useRetryReport,
  useSessionUsage,
} from '@/frontend/features/reports/queries';
import { RubricRadar } from '@/frontend/features/reports/radar';
import { ApiClientError } from '@/frontend/lib/api';
import type { DiagnosisReportView, DiagnosisStatus, ScoredAnswer } from '@/shared/schemas/diagnosis';
import type { InterviewTurnView } from '@/shared/schemas/interview';
import type { RubricDefinition } from '@/shared/schemas/rubric';
import { skillLabel } from '@/shared/schemas/skill-tags';
import type { SessionUsage } from '@/shared/schemas/usage';
import type { WeaknessItem } from '@/shared/schemas/weakness';

const STATUS_LABEL: Record<DiagnosisStatus, string> = {
  pending: '排队中',
  running: '生成中',
  done: '已生成',
  failed: '生成失败',
};

const SEVERITY_LABEL: Record<number, string> = { 1: '轻微', 2: '明显', 3: '严重' };

export default function ReportsPage() {
  const { reportId } = useParams();
  if (reportId) return <ReportDetail reportId={reportId} />;
  return <ReportList />;
}

function StatusBadge({ status }: { status: DiagnosisStatus }) {
  const variant = status === 'done' ? 'secondary' : status === 'failed' ? 'destructive' : 'outline';
  return <Badge variant={variant}>{STATUS_LABEL[status]}</Badge>;
}

function ReportList() {
  const reports = useReports();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">诊断报告</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          每场面试结束后自动生成。评分标准公开且带版本号，内容由 AI 生成，仅用于练习参考。
        </p>
      </div>
      {reports.isPending && <Loader2 className="text-muted-foreground size-5 animate-spin" />}
      {reports.isError && <p className="text-destructive text-sm">{reports.error.message}</p>}
      {reports.data?.reports.length === 0 && (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            还没有报告。
            <Link to="/interviews" className="underline">
              先完成一场模拟面试
            </Link>
          </CardContent>
        </Card>
      )}
      <div className="space-y-3">
        {reports.data?.reports.map((report) => (
          <Card key={report.id}>
            <CardHeader>
              <CardTitle className="text-base">
                <Link to={`/reports/${report.id}`} className="hover:underline">
                  {report.jobTitle}
                </Link>
              </CardTitle>
              <CardDescription>
                {new Date(report.createdAt).toLocaleString()} · 评分标准 {report.rubricVersion}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              <StatusBadge status={report.status} />
              {report.overall !== null && (
                <span className="text-sm">
                  总分 <span className="font-semibold">{report.overall.toFixed(1)}</span> / 5
                </span>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ReportDetail({ reportId }: { reportId: string }) {
  const report = useReport(reportId);
  const retry = useRetryReport(reportId);
  const training = useCreateTraining();
  const navigate = useNavigate();
  const [trainingError, setTrainingError] = useState('');

  const startTraining = (tag: string) => {
    setTrainingError('');
    training.mutate(
      { reportId, tag },
      {
        onSuccess: (session) => void navigate(`/interviews/${session.id}`),
        onError: (err) => setTrainingError(err instanceof ApiClientError ? err.message : '创建专项训练失败'),
      },
    );
  };
  const drill = {
    start: startTraining,
    pending: training.isPending ? (training.variables?.tag ?? null) : null,
  };

  if (report.isPending) return <Loader2 className="text-muted-foreground size-5 animate-spin" />;
  if (report.isError) return <p className="text-destructive text-sm">{report.error.message}</p>;
  if (!report.data) return <p className="text-sm">找不到这份报告。</p>;
  const data = report.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{data.jobTitle} · 诊断报告</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {new Date(data.createdAt).toLocaleString()} · 评分标准 {data.rubricVersion} · 内容由 AI 生成
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={data.status} />
          <Button variant="outline" size="sm" asChild>
            <Link to={`/interviews/${data.sessionId}`}>查看对话</Link>
          </Button>
        </div>
      </div>

      {data.status !== 'done' && (
        <Card>
          <CardContent className="space-y-3 py-8 text-center text-sm">
            {data.status === 'failed' ? (
              <>
                <AlertTriangle className="text-destructive mx-auto size-6" />
                <p className="text-destructive">{data.error ?? '诊断失败'}</p>
                <Button size="sm" onClick={() => retry.mutate()} disabled={retry.isPending}>
                  {retry.isPending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                  重新生成
                </Button>
                {retry.isError && <p className="text-destructive">{retry.error.message}</p>}
              </>
            ) : (
              <>
                <Loader2 className="text-muted-foreground mx-auto size-6 animate-spin" />
                <p className="text-muted-foreground">报告正在后台生成，页面会自动刷新。</p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {data.status === 'done' && data.scores && (
        <>
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">各维度得分</CardTitle>
                <CardDescription>总分 {data.scores.overall.toFixed(1)} / 5（按维度权重加权）</CardDescription>
              </CardHeader>
              <CardContent>
                <RubricRadar data={data.scores.dimensions.map((d) => ({ label: d.label, score: d.score }))} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">技能得分</CardTitle>
                <CardDescription>按本场题目涉及的技能标签摊分，最弱的排在前面。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.scores.skills.length === 0 && (
                  <p className="text-muted-foreground text-sm">本场没有可评分的回答。</p>
                )}
                {data.scores.skills.map((skill) => (
                  <div key={skill.tag} className="flex items-center gap-3 text-sm">
                    <span className="w-24 shrink-0">{skill.label}</span>
                    <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                      <div className="bg-primary h-full" style={{ width: `${(skill.score / 5) * 100}%` }} />
                    </div>
                    <span className="text-muted-foreground w-20 shrink-0 text-right">
                      {skill.score.toFixed(1)} · {skill.count} 题
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <WeaknessSection weaknesses={data.weaknesses} turns={data.turns} drill={drill} />
          <PlanSection plan={data.plan} drill={drill} />
          {trainingError && <p className="text-destructive text-sm">{trainingError}</p>}
          <AnswerSection answers={data.scores.answers} turns={data.turns} rubric={data.rubric} />
          <UsageSection sessionId={data.sessionId} />
          <RubricSection rubric={data.rubric} version={data.rubricVersion} />
        </>
      )}
    </div>
  );
}

/** 一键进入专项训练：pending 存的是正在创建的那个 tag，避免整排按钮一起转圈 */
interface Drill {
  start: (tag: string) => void;
  pending: string | null;
}

function DrillButton({ tag, drill }: { tag: string; drill: Drill }) {
  return (
    <Button size="sm" variant="outline" disabled={drill.pending !== null} onClick={() => drill.start(tag)}>
      {drill.pending === tag ? <Loader2 className="animate-spin" /> : <Dumbbell />}
      专项训练
    </Button>
  );
}

function WeaknessSection({
  weaknesses,
  turns,
  drill,
}: {
  weaknesses: WeaknessItem[];
  turns: InterviewTurnView[];
  drill: Drill;
}) {
  const seqOf = (turnId: string | null) => turns.find((turn) => turn.id === turnId)?.seq;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">短板与证据</CardTitle>
        <CardDescription>
          每条短板都附上你当时的原话，可以回到对话里核对。短板会写回职业档案，下一场面试优先问这些点。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {weaknesses.length === 0 && <p className="text-muted-foreground text-sm">本场没有识别出明显短板。</p>}
        {weaknesses.map((item) => (
          <div key={item.id} className="space-y-1.5 rounded-md border px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline">{item.label}</Badge>
              <span className="font-medium">{item.title}</span>
              <Badge variant={item.severity >= 3 ? 'destructive' : 'secondary'}>
                {SEVERITY_LABEL[item.severity] ?? item.severity}
              </Badge>
              <span className="ml-auto">
                <DrillButton tag={item.tag} drill={drill} />
              </span>
            </div>
            <p className="text-muted-foreground text-sm">{item.detail}</p>
            <blockquote className="border-muted text-muted-foreground border-l-2 pl-3 text-sm italic">
              {seqOf(item.evidenceTurnId) !== undefined && (
                <span className="not-italic">第 {seqOf(item.evidenceTurnId)} 轮：</span>
              )}
              {item.evidenceQuote}
            </blockquote>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function PlanSection({ plan, drill }: { plan: DiagnosisReportView['plan']; drill: Drill }) {
  if (!plan) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">复训计划</CardTitle>
        <CardDescription>{plan.summary || '按下面的动作各练一轮。'}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {plan.items.length === 0 && <p className="text-muted-foreground text-sm">暂无需要专项练习的方向。</p>}
        {plan.items.map((item) => (
          <div key={item.tag} className="space-y-1.5 rounded-md border px-3 py-2.5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{skillLabel(item.tag)}</Badge>
              <span className="font-medium">{item.focus}</span>
              <span className="text-muted-foreground">建议 {item.questionCount} 题</span>
              <span className="ml-auto">
                <DrillButton tag={item.tag} drill={drill} />
              </span>
            </div>
            <ul className="text-muted-foreground list-disc space-y-1 pl-5">
              {item.actions.map((action, index) => (
                <li key={index}>{action}</li>
              ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AnswerSection({
  answers,
  turns,
  rubric,
}: {
  answers: ScoredAnswer[];
  turns: InterviewTurnView[];
  rubric: RubricDefinition | null;
}) {
  const labelOf = (key: string) => rubric?.dimensions.find((d) => d.key === key)?.label ?? key;
  const answerOf = (turnId: string) => turns.find((turn) => turn.id === turnId)?.content ?? '';
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">逐题点评</CardTitle>
        <CardDescription>参考要点只用于判断是否答到，不作为“标准答案”展示。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {answers.length === 0 && <p className="text-muted-foreground text-sm">本场没有可评分的回答。</p>}
        {answers.map((answer, index) => (
          <div key={answer.turnId} className="space-y-2 rounded-md border px-3 py-2.5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                第 {index + 1} 题 · {answer.question}
              </span>
              <span className="text-muted-foreground shrink-0">本题 {answer.score.toFixed(1)} / 5</span>
            </div>
            <p className="text-muted-foreground whitespace-pre-wrap">你的回答：{answerOf(answer.turnId)}</p>
            <div className="flex flex-wrap gap-1.5">
              {answer.dimensions.map((dimension) => (
                <Badge key={dimension.key} variant="outline">
                  {labelOf(dimension.key)} {dimension.score}
                </Badge>
              ))}
            </div>
            <p>{answer.comment}</p>
            {answer.highlight && <p className="text-muted-foreground">答到：{answer.highlight}</p>}
            {answer.gap && <p className="text-muted-foreground">缺的：{answer.gap}</p>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

const money = (value: number | null) => (value === null ? '未配置单价' : `¥${value.toFixed(4)}`);

/** 单场用量：面试 + 这一场的诊断，都挂在同一个 sessionId 上（N-12、02 §5.6） */
function UsageSection({ sessionId }: { sessionId: string }) {
  const usage = useSessionUsage(sessionId);
  if (usage.isPending || usage.isError || !usage.data) return null;
  const { totals, byFunction, budget }: SessionUsage = usage.data;
  if (totals.calls === 0) return null;
  const percent = Math.min(100, Math.round((budget.used / budget.tokenLimit) * 100));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="size-4" />
          本场用量与成本
        </CardTitle>
        <CardDescription>
          含这场面试和它的诊断，共 {totals.calls} 次模型调用。成本按配置的单价估算，仅供参考。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span>
            输入 <span className="font-medium">{totals.inputTokens}</span> token
          </span>
          <span>
            输出 <span className="font-medium">{totals.outputTokens}</span> token
          </span>
          <span>
            估算成本 <span className="font-medium">{money(totals.cost)}</span>
          </span>
          {totals.errors > 0 && <span className="text-destructive">失败 {totals.errors} 次</span>}
        </div>
        <div className="space-y-1">
          <div className="text-muted-foreground flex items-center justify-between text-xs">
            <span>单场上限 {budget.tokenLimit} token</span>
            <span>
              已用 {budget.used}（{percent}%）
            </span>
          </div>
          <div className="bg-muted h-2 overflow-hidden rounded-full">
            <div
              className={budget.exceeded ? 'bg-destructive h-full' : 'bg-primary h-full'}
              style={{ width: `${percent}%` }}
            />
          </div>
          {budget.exceeded && (
            <p className="text-destructive text-xs">已达上限，这场面试不能再继续，但报告不受影响。</p>
          )}
        </div>
        <div className="space-y-1">
          {byFunction.map((item) => (
            <div key={item.functionId} className="text-muted-foreground flex items-center gap-3 text-xs">
              <span className="w-44 shrink-0 font-mono">{item.functionId}</span>
              <span className="w-16 shrink-0 text-right">{item.calls} 次</span>
              <span className="w-28 shrink-0 text-right">{item.inputTokens + item.outputTokens} token</span>
              <span className="w-24 shrink-0 text-right">{money(item.cost)}</span>
              <span className="w-20 shrink-0 text-right">{item.avgLatencyMs} ms</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function RubricSection({ rubric, version }: { rubric: RubricDefinition | null; version: string }) {
  if (!rubric) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-6 text-sm">
          本份报告使用的评分标准 {version} 已不在库中。
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="size-4" />
          评分标准 {rubric.version}
        </CardTitle>
        <CardDescription>{rubric.title}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {rubric.notes.length > 0 && (
          <ul className="text-muted-foreground list-disc space-y-1 pl-5">
            {rubric.notes.map((note, index) => (
              <li key={index}>{note}</li>
            ))}
          </ul>
        )}
        {rubric.dimensions.map((dimension) => (
          <div key={dimension.key} className="rounded-md border px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{dimension.label}</span>
              <span className="text-muted-foreground">权重 {Math.round(dimension.weight * 100)}%</span>
            </div>
            <p className="text-muted-foreground mt-1">{dimension.description}</p>
            <ul className="text-muted-foreground mt-1 space-y-0.5">
              {dimension.anchors.map((anchor) => (
                <li key={anchor.score}>
                  {anchor.score} 分：{anchor.text}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
