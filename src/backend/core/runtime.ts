/**
 * @file 【后端·core】进程级运行时（启动 / 停机）
 * 启动顺序：校验模型注册表 → （MIGRATE_ON_START）执行迁移 → 确保开发用户存在 → 建 LangGraph 存档表 → 启动 pg-boss 并注册任务。
 * 停机顺序：停止 pg-boss（等待进行中任务）→ 关闭数据库连接池。
 */
import { PgBoss } from 'pg-boss';
import { closePool } from '@/backend/db/client';
import { runMigrations } from '@/backend/db/migrate';
import { ensureUser } from '@/backend/db/repos/users';
import { serverEnv } from '@/shared/env/server';
import { setupCheckpointer } from '@/agent/graphs/checkpointer';
import { registerJobs } from '@/backend/jobs';
import { enqueueDiagnose } from '@/backend/jobs/diagnose';
import { enqueueEmbedFacts } from '@/backend/jobs/embed-facts';
import { enqueueEmbedQuestions } from '@/backend/jobs/embed-questions';
import { setEmbedFactsSender } from '@/backend/core/embed.service';
import { setDiagnoseSender } from '@/backend/core/diagnosis.service';
import { requestEmbedQuestions, setEmbedQuestionsSender } from '@/backend/core/question-embed.service';
import { setBoss } from '@/backend/jobs/boss';
import { assertRegistry } from '@/agent/llm/registry';
import { logger } from '@/shared/common/logger';

let boss: PgBoss | undefined;

/**
 * 进程启动：校验模型注册表 → （可选）迁移 → 确保开发用户 → 存档表 → pg-boss 与定时任务。
 * 任一步失败直接抛出，由 entry 退出进程。
 */
export async function startRuntime() {
  const env = serverEnv();
  const models = assertRegistry();
  logger.info({ models }, 'model registry ready');

  if (env.migrateOnStart) await runMigrations();
  await ensureUser(env.devUserId);
  await setupCheckpointer();

  boss = new PgBoss({
    connectionString: env.databaseUrl,
    schema: 'pgboss',
    max: 2,
    application_name: 'mockmate-boss',
  });
  boss.on('error', (err) => logger.error({ err }, 'pg-boss error'));
  await boss.start();
  setBoss(boss);
  const running = boss;
  setEmbedFactsSender(async (userId) => {
    await enqueueEmbedFacts(running, userId);
  });
  setEmbedQuestionsSender(async () => {
    await enqueueEmbedQuestions(running);
  });
  setDiagnoseSender(async (input) => {
    await enqueueDiagnose(running, input);
  });
  await registerJobs(boss, { backup: { cron: env.backup.cron, enabled: Boolean(env.backup.dir) } });
  await requestEmbedQuestions();
  logger.info({ backup: env.backup.dir ? env.backup.cron : 'disabled' }, 'jobs ready');
}

/** 优雅停机：停止 pg-boss（等待进行中任务）→ 关闭连接池 */
export async function stopRuntime() {
  try {
    await boss?.stop({ graceful: true, timeout: 10_000 });
  } catch (err) {
    logger.error({ err }, 'pg-boss stop failed');
  }
  boss = undefined;
  setBoss(undefined);
  await closePool();
}

export function getBoss(): PgBoss | undefined {
  return boss;
}
