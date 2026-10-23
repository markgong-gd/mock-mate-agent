/**
 * @file 【后端·路由】元信息
 * 接口：GET /api/meta → 是否开启开发路由 / 口令，以及各模型别名对应的 provider:model（不含密钥）。
 */
import { Hono } from 'hono';
import { listModelAliases } from '@/backend/core/llm.service';
import type { AppEnv } from '../types';

export const metaRoutes = (opts: { devRoutes: boolean; accessGate: boolean }) =>
  new Hono<AppEnv>().get('/', (c) =>
    c.json({
      name: 'mockmate',
      devRoutes: opts.devRoutes,
      accessGate: opts.accessGate,
      models: listModelAliases(),
    }),
  );
