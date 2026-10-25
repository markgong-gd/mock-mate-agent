/**
 * @file 【后端·路由】成长曲线
 * GET /api/growth   同一技能多次诊断的得分趋势 + 总分趋势（R-C3-5）
 */
import { Hono } from 'hono';
import { getGrowth } from '@/backend/core/growth.service';
import { toCtx, type AppEnv } from '../types';

export const growthRoutes = () => new Hono<AppEnv>().get('/', async (c) => c.json(await getGrowth(toCtx(c))));
