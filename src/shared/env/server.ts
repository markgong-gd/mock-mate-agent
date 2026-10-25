/**
 * @file 【公共·env】后端配置（只允许后端使用）
 * 做什么：用 Zod 解析全部服务端环境变量（DB、PROVIDERS / PROVIDER_*、MODEL_*、口令、备份、端口等），
 *        非法或缺失时列出全部问题并退出。serverEnv() 返回带缓存的类型化配置。密钥只在这里读取。
 */
import { z } from 'zod';
import { loadDotEnv } from './load';

export const PROVIDER_KINDS = ['openai-compatible', 'deepseek', 'ollama', 'fake'] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

export const CHAT_ALIASES = ['chat', 'judge', 'extract', 'fallback'] as const;
export type ChatAlias = (typeof CHAT_ALIASES)[number];

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const bool = (defaultValue: boolean) =>
  z.preprocess(
    emptyToUndefined,
    z
      .enum(['true', 'false', '1', '0'])
      .transform((v) => v === 'true' || v === '1')
      .optional()
      .transform((v) => v ?? defaultValue),
  );

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());

const modelRef = z
  .string()
  .regex(/^[a-z0-9_-]+:.+$/i, '格式应为 <provider>:<model>，如 deepseek:deepseek-chat')
  .transform((v) => {
    const idx = v.indexOf(':');
    return { provider: v.slice(0, idx).toLowerCase(), model: v.slice(idx + 1), id: v };
  });
export type ModelRef = z.infer<typeof modelRef>;

const modelCapsOverride = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .transform((v, ctx) => {
      try {
        return JSON.parse(v) as unknown;
      } catch {
        ctx.addIssue({ code: 'custom', message: '必须是 JSON，如 {"jsonMode":true,"tools":false}' });
        return z.NEVER;
      }
    })
    .pipe(
      z
        .object({
          jsonSchema: z.boolean(),
          tools: z.boolean(),
          jsonMode: z.boolean(),
          reasoning: z.boolean(),
          contextWindow: z.number().int().positive(),
        })
        .partial()
        .strict(),
    )
    .optional(),
);

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, '必须是 postgres:// 连接串'),
  DB_POOL_MAX: z.coerce.number().int().positive().default(6),
  MIGRATE_ON_START: bool(false),

  DEV_USER_ID: z.uuid().default('00000000-0000-4000-8000-000000000001'),
  ACCESS_PASSWORD: z.preprocess(emptyToUndefined, z.string().min(8, '至少 8 位').optional()),
  COOKIE_SECRET: z.preprocess(emptyToUndefined, z.string().min(32, '至少 32 位').optional()),
  COOKIE_SECURE: z.preprocess(emptyToUndefined, z.enum(['true', 'false', '1', '0']).optional()),
  ENABLE_DEV_ROUTES: z.preprocess(emptyToUndefined, z.enum(['true', 'false', '1', '0']).optional()),
  SERVE_STATIC: z.preprocess(emptyToUndefined, z.enum(['true', 'false', '1', '0']).optional()),
  STATIC_DIR: z.string().default('dist/client'),

  BACKUP_DIR: optionalString,
  BACKUP_KEEP: z.coerce.number().int().positive().default(7),
  BACKUP_CRON: z.string().default('0 3 * * *'),

  PROVIDERS: z
    .string()
    .min(1, '至少配置一个 provider')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().regex(/^[a-z0-9_-]+$/)).min(1)),
  ALLOWED_PROVIDERS: z
    .string()
    .default('*')
    .transform((v) =>
      v.trim() === '*'
        ? ('*' as const)
        : v
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean),
    ),

  MODEL_CHAT: modelRef,
  MODEL_JUDGE: modelRef,
  MODEL_EXTRACT: modelRef,
  MODEL_FALLBACK: z.preprocess(emptyToUndefined, modelRef.optional()),
  MODEL_EMBED: z.preprocess(emptyToUndefined, modelRef.optional()),
  /** 默认 1024，与 facts.embedding 列一致（bge-m3 / 离线 n-gram）。改维度要加迁移 */
  EMBEDDING_DIM: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().max(2000).default(1024)),

  MODEL_CAPS_CHAT: modelCapsOverride,
  MODEL_CAPS_JUDGE: modelCapsOverride,
  MODEL_CAPS_EXTRACT: modelCapsOverride,
  MODEL_CAPS_FALLBACK: modelCapsOverride,

  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  FAKE_LLM_DELAY_MS: z.coerce.number().int().min(0).default(25),
});

const providerSchema = z
  .object({
    kind: z.enum(PROVIDER_KINDS),
    baseUrl: z.preprocess(emptyToUndefined, z.url().optional()),
    apiKey: optionalString,
  })
  .superRefine((p, ctx) => {
    if (p.kind === 'openai-compatible') {
      if (!p.baseUrl)
        ctx.addIssue({ code: 'custom', path: ['baseUrl'], message: 'openai-compatible 需要 BASE_URL' });
      if (!p.apiKey)
        ctx.addIssue({ code: 'custom', path: ['apiKey'], message: 'openai-compatible 需要 API_KEY' });
    }
    if (p.kind === 'deepseek' && !p.apiKey) {
      ctx.addIssue({ code: 'custom', path: ['apiKey'], message: 'deepseek 需要 API_KEY' });
    }
  });
export type ProviderConfig = z.infer<typeof providerSchema>;

export type ServerEnv = ReturnType<typeof parseServerEnv>;

export class EnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(`环境变量校验失败:\n  - ${issues.join('\n  - ')}`);
    this.name = 'EnvError';
  }
}

const toBool = (v: string | undefined, d: boolean) => (v === undefined ? d : v === 'true' || v === '1');

/** 纯函数：从给定变量表解析服务端配置（便于测试） */
export function parseServerEnv(source: Record<string, string | undefined>) {
  const issues: string[] = [];
  const base = baseSchema.safeParse(source);
  if (!base.success) {
    for (const i of base.error.issues) issues.push(`${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new EnvError(issues);
  }
  const b = base.data;

  const providers: Record<string, ProviderConfig> = {};
  for (const name of b.PROVIDERS) {
    const prefix = `PROVIDER_${name.toUpperCase().replace(/-/g, '_')}_`;
    const parsed = providerSchema.safeParse({
      kind: source[`${prefix}KIND`],
      baseUrl: source[`${prefix}BASE_URL`],
      apiKey: source[`${prefix}API_KEY`],
    });
    if (!parsed.success) {
      for (const i of parsed.error.issues) {
        const field = { kind: 'KIND', baseUrl: 'BASE_URL', apiKey: 'API_KEY' }[String(i.path[0])] ?? '';
        issues.push(`${prefix}${field}: ${i.message}`);
      }
      continue;
    }
    providers[name] = parsed.data;
  }

  const models = {
    chat: b.MODEL_CHAT,
    judge: b.MODEL_JUDGE,
    extract: b.MODEL_EXTRACT,
    fallback: b.MODEL_FALLBACK,
    embed: b.MODEL_EMBED,
  };
  for (const [alias, ref] of Object.entries(models)) {
    if (ref && !b.PROVIDERS.includes(ref.provider)) {
      issues.push(`MODEL_${alias.toUpperCase()}: provider "${ref.provider}" 不在 PROVIDERS 中`);
    }
  }
  // 1024 与 shared/schemas/embedding.ts 的 EMBEDDING_DIM 一致。env 层不能引用 schemas。
  if (b.EMBEDDING_DIM !== 1024) {
    issues.push('EMBEDDING_DIM: 当前 facts.embedding 固定为 1024，更换维度需要新迁移（02 §5.4）');
  }
  if (b.ACCESS_PASSWORD && !b.COOKIE_SECRET) issues.push('COOKIE_SECRET: 启用 ACCESS_PASSWORD 时必填');

  if (issues.length) throw new EnvError(issues);

  const isProd = b.NODE_ENV === 'production';
  return {
    nodeEnv: b.NODE_ENV,
    isProd,
    host: b.HOST,
    port: b.PORT,
    logLevel: b.LOG_LEVEL,
    databaseUrl: b.DATABASE_URL,
    dbPoolMax: b.DB_POOL_MAX,
    migrateOnStart: b.MIGRATE_ON_START,
    devUserId: b.DEV_USER_ID,
    access: {
      password: b.ACCESS_PASSWORD,
      cookieSecret: b.COOKIE_SECRET,
      cookieSecure: toBool(b.COOKIE_SECURE, isProd),
    },
    enableDevRoutes: toBool(b.ENABLE_DEV_ROUTES, !isProd),
    serveStatic: toBool(b.SERVE_STATIC, isProd),
    staticDir: b.STATIC_DIR,
    backup: { dir: b.BACKUP_DIR, keep: b.BACKUP_KEEP, cron: b.BACKUP_CRON },
    llm: {
      providers,
      allowedProviders: b.ALLOWED_PROVIDERS,
      models,
      caps: {
        chat: b.MODEL_CAPS_CHAT,
        judge: b.MODEL_CAPS_JUDGE,
        extract: b.MODEL_CAPS_EXTRACT,
        fallback: b.MODEL_CAPS_FALLBACK,
      },
      embeddingDim: b.EMBEDDING_DIM,
      timeoutMs: b.LLM_TIMEOUT_MS,
      maxRetries: b.LLM_MAX_RETRIES,
      fakeDelayMs: b.FAKE_LLM_DELAY_MS,
    },
  };
}

let cached: ServerEnv | undefined;

/** 读取并缓存服务端配置；首次调用时若存在 .env 则加载（不覆盖已有变量） */
export function serverEnv(): ServerEnv {
  if (cached) return cached;
  loadDotEnv();
  cached = parseServerEnv(process.env);
  return cached;
}

/** 测试用：注入配置 */
export function setServerEnvForTesting(env: ServerEnv | undefined) {
  cached = env;
}
