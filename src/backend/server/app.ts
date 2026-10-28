/**
 * @file 【后端·server】Hono 应用装配
 * 做什么：中间件链 requestId → accessGate → devUser → /api 子路由；统一错误处理。
 * 关键产出：export type AppType —— 前端 hc<AppType> 依赖它获得类型安全的 API。
 * 新增路由：在 routes/ 写好后，在 apiRoutes 中 .route() 链式注册（必须链式，类型才能推导）。
 */
import { Hono } from 'hono';
import { serverEnv } from '@/shared/env/server';
import { accessGate, isGateEnabled, type AccessGateOptions } from './middleware/access-gate';
import { devUser } from './middleware/dev-user';
import { errorHandler, notFoundHandler } from './middleware/error';
import { requestId } from './middleware/request-id';
import { accessRoutes } from './routes/access';
import { consentRoutes } from './routes/consents';
import { devRoutes } from './routes/dev';
import { growthRoutes } from './routes/growth';
import { healthRoutes } from './routes/health';
import { interviewRoutes } from './routes/interviews';
import { jobRoutes } from './routes/jobs';
import { llmRoutes } from './routes/llm';
import { metaRoutes } from './routes/meta';
import { profileRoutes } from './routes/profile';
import { reportRoutes } from './routes/reports';
import { resumeRoutes } from './routes/resumes';
import { studioRoutes } from './routes/studio';
import { trainingRoutes } from './routes/training';
import { usageRoutes } from './routes/usage';
import type { AppEnv } from './types';

export interface AppConfig {
  devUserId: string;
  access: AccessGateOptions;
  enableDevRoutes: boolean;
}

export const appConfigFromEnv = (): AppConfig => {
  const env = serverEnv();
  return { devUserId: env.devUserId, access: env.access, enableDevRoutes: env.enableDevRoutes };
};

/** /api 路由：链式注册，导出类型供前端 hc<AppType> 使用（02 §4.1） */
const apiRoutes = (cfg: AppConfig) =>
  new Hono<AppEnv>()
    .route('/', healthRoutes())
    .route('/meta', metaRoutes({ devRoutes: cfg.enableDevRoutes, accessGate: isGateEnabled(cfg.access) }))
    .route('/access', accessRoutes(cfg.access))
    .route('/llm', llmRoutes())
    .route('/consents', consentRoutes())
    .route('/profile', profileRoutes())
    .route('/jobs', jobRoutes())
    .route('/resumes', resumeRoutes())
    .route('/studio', studioRoutes())
    .route('/interviews', interviewRoutes())
    .route('/training', trainingRoutes())
    .route('/reports', reportRoutes())
    .route('/growth', growthRoutes())
    .route('/usage', usageRoutes())
    .route('/dev', devRoutes(cfg.enableDevRoutes));

/**
 * Hono 实例：中间件 requestId → accessGate → devUser → 路由；错误统一由 errorHandler 输出。
 * 静态资源托管属于平台相关逻辑，在 entry.ts 中追加。
 */
export function createApp(cfg: AppConfig = appConfigFromEnv()) {
  const app = new Hono<AppEnv>()
    .use(requestId())
    .use(accessGate(cfg.access))
    .use(devUser(cfg.devUserId))
    .route('/api', apiRoutes(cfg));
  app.onError(errorHandler);
  app.notFound(notFoundHandler);
  return app;
}

export type AppType = ReturnType<typeof createApp>;
