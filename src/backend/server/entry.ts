/**
 * @file 【后端·server】进程入口（pnpm dev:server / node dist/server/entry.js）
 * 做什么：校验环境变量 → core/runtime.startRuntime()（迁移、存档表、pg-boss）→ createApp() →
 *        生产环境额外托管 dist/client 静态资源与 SPA fallback → 监听端口 → SIGTERM/SIGINT 时优雅停机。
 * 约定：平台相关逻辑（静态托管、端口、停机）只出现在这里。
 */
import '@/shared/env/load';
import type { Server } from 'node:http';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { startRuntime, stopRuntime } from '@/backend/core/runtime';
import { EnvError, serverEnv } from '@/shared/env/server';
import { logger } from '@/shared/common/logger';
import { createApp } from './app';

const SHUTDOWN_TIMEOUT_MS = 15_000;

async function main() {
  let env;
  try {
    env = serverEnv();
  } catch (e) {
    if (e instanceof EnvError) {
      logger.fatal(e.message);
      process.exit(1);
    }
    throw e;
  }

  await startRuntime();
  const app = createApp();

  if (env.serveStatic) {
    const root = env.staticDir;
    app.use(
      '/assets/*',
      serveStatic({
        root,
        onFound: (_p, c) => c.header('Cache-Control', 'public, max-age=31536000, immutable'),
      }),
    );
    app.use('/*', serveStatic({ root }));
    const spaFallback = serveStatic({ path: `${root}/index.html` });
    app.get('*', (c, next) => (c.req.path.startsWith('/api/') ? next() : spaFallback(c, next)));
  }

  const server = serve({ fetch: app.fetch, hostname: env.host, port: env.port }, (info) =>
    logger.info(
      {
        url: `http://${info.address}:${info.port}`,
        env: env.nodeEnv,
        static: env.serveStatic,
        devRoutes: env.enableDevRoutes,
      },
      'server listening',
    ),
  ) as Server;

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, 'shutting down: stop accepting new requests');
    const force = setTimeout(() => {
      logger.warn('in-flight requests did not finish in time, closing connections');
      server.closeAllConnections();
    }, SHUTDOWN_TIMEOUT_MS);
    force.unref();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    clearTimeout(force);
    await stopRuntime();
    logger.info('bye');
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
