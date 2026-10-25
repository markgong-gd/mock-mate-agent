/**
 * @file 【后端·路由】上传同意
 * GET  /api/consents/resume-parse  当前文案版本是否已同意
 * POST /api/consents               记录同意
 */
import { Hono } from 'hono';
import { getResumeParseConsent, grantResumeParseConsent } from '@/backend/core/consent.service';
import { consentGrantSchema } from '@/shared/schemas/consent';
import { toCtx, type AppEnv } from '../types';
import { validate } from '../validate';

export const consentRoutes = () =>
  new Hono<AppEnv>()
    .get('/resume-parse', async (c) => c.json(await getResumeParseConsent(toCtx(c))))
    .post('/', validate('json', consentGrantSchema), async (c) =>
      c.json(await grantResumeParseConsent(toCtx(c), c.req.valid('json'))),
    );
