/**
 * @file 【前端·页面】首页"系统状态"
 * 做什么：展示服务存活（/api/healthz）、就绪（/api/readyz，含 DB）以及各模型别名的 Ping 结果。
 * 数据来源：features/system/queries.ts。
 */
import { CheckCircle2, Loader2, XCircle, Zap } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import {
  useHealth,
  useMeta,
  usePing,
  useReady,
  type ChatAliasName,
} from '@/frontend/features/system/queries';
import { ApiClientError } from '@/frontend/lib/api';

function StatusRow({ label, ok, detail }: { label: string; ok: boolean | undefined; detail?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span>{label}</span>
      <span className="flex items-center gap-1.5">
        {detail && <span className="text-muted-foreground text-xs">{detail}</span>}
        {ok === undefined ? (
          <Loader2 className="text-muted-foreground size-4 animate-spin" />
        ) : ok ? (
          <CheckCircle2 className="text-success size-4" />
        ) : (
          <XCircle className="text-destructive size-4" />
        )}
      </span>
    </div>
  );
}

function PingRow({ alias, model }: { alias: ChatAliasName; model: string | null }) {
  const ping = usePing();
  const err = ping.error instanceof ApiClientError ? ping.error : undefined;
  return (
    <div className="flex flex-wrap items-center gap-3 border-b py-2.5 last:border-0">
      <Badge variant="secondary" className="w-16 font-mono">
        {alias}
      </Badge>
      <span className="min-w-40 flex-1 font-mono text-sm">
        {model ?? <span className="text-muted-foreground">未配置</span>}
      </span>
      {ping.data && (
        <span className="text-muted-foreground text-xs">
          {ping.data.latencyMs} ms · “{ping.data.reply.slice(0, 24)}”
        </span>
      )}
      {err && <span className="text-destructive text-xs">{`${err.code}：${err.message}`}</span>}
      <Button
        size="sm"
        variant="outline"
        disabled={!model || ping.isPending}
        onClick={() => ping.mutate(alias)}
      >
        {ping.isPending ? <Loader2 className="animate-spin" /> : <Zap />}
        Ping
      </Button>
    </div>
  );
}

export default function HomePage() {
  const health = useHealth();
  const ready = useReady();
  const meta = useMeta();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">系统状态</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          服务、数据库、模型注册表与 LangGraph 运行时的连通性检查。简历定制从
          <Link to="/profile" className="text-foreground underline-offset-4 hover:underline">
            {' '}
            职业档案
          </Link>
          开始。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>服务</CardTitle>
            <CardDescription>/api/healthz · /api/readyz</CardDescription>
          </CardHeader>
          <CardContent>
            <StatusRow
              label="进程存活"
              ok={health.isPending ? undefined : health.isSuccess}
              detail={health.data ? `已运行 ${health.data.uptimeS}s` : undefined}
            />
            <StatusRow
              label="数据库"
              ok={ready.isPending ? undefined : ready.data?.ok === true}
              detail={ready.data?.checks.db ? `${ready.data.checks.db.ms} ms` : undefined}
            />
            <StatusRow
              label="访问口令"
              ok={meta.data ? true : undefined}
              detail={meta.data?.accessGate ? '已启用' : '未启用'}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>LangGraph 回声图</CardTitle>
            <CardDescription>ask → wait_answer(interrupt) → reply，PostgresSaver 存档</CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-3 text-sm">
            <p>验证逐字流式、首字延迟、刷新页面与进程重启后从存档恢复。</p>
            {meta.data?.devRoutes ? (
              <Button asChild size="sm">
                <Link to="/dev/echo">打开回声图</Link>
              </Button>
            ) : (
              <Badge variant="outline">开发路由未启用（ENABLE_DEV_ROUTES）</Badge>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>模型别名</CardTitle>
          <CardDescription>
            业务只使用别名；provider 与模型由 .env 中的 MODEL_* 决定，修改后重启即可切换。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {meta.isPending && <Loader2 className="text-muted-foreground size-4 animate-spin" />}
          {meta.data?.models.map((m) => (
            <PingRow key={m.alias} alias={m.alias} model={m.model} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
