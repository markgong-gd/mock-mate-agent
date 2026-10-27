// @ts-check
import js from '@eslint/js';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import { importX } from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * 分层依赖规则（docs/02-architecture.md §2.3，目录总览见 docs/04-code-map.md）。
 * src 按"前端 / 后端 / 智能体 / 公共底座"四块组织，每块下再分层：
 *   frontend/                       前端（浏览器）
 *   backend/{server,core,db,jobs}   后端（Node 进程）
 *   agent/{graphs,llm,prompts,tools,retrieval,rubrics,voice}  智能体（后端进程内）
 *   shared/{domain,schemas,env,common}  公共底座
 * key 为 src 下的层目录，value 为该层允许依赖的其它层（自身总是允许）。未列出的层一律禁止依赖。
 */
const LAYER_DEPS = {
  frontend: ['shared/schemas', 'shared/common', 'backend/server', 'shared/env'],
  'backend/server': ['backend/core', 'shared/schemas', 'shared/common', 'shared/env'],
  'backend/core': [
    'agent/graphs',
    'backend/jobs',
    'agent/voice',
    'agent/retrieval',
    'agent/llm',
    'backend/db',
    'shared/domain',
    'shared/schemas',
    'shared/common',
    'shared/env',
  ],
  'agent/graphs': [
    'agent/tools',
    'agent/retrieval',
    'agent/prompts',
    'agent/rubrics',
    'agent/llm',
    'backend/db',
    'shared/domain',
    'shared/schemas',
    'shared/common',
  ],
  'backend/jobs': ['backend/core', 'shared/schemas', 'shared/common'],
  'agent/tools': [
    'agent/graphs',
    'agent/llm',
    'backend/db',
    'shared/domain',
    'shared/schemas',
    'shared/common',
  ],
  'agent/retrieval': ['agent/llm', 'backend/db', 'shared/domain', 'shared/schemas', 'shared/common'],
  'agent/prompts': ['shared/schemas', 'shared/common'],
  'agent/rubrics': ['shared/schemas', 'shared/common'],
  'agent/voice': ['agent/llm', 'shared/schemas', 'shared/common', 'shared/env'],
  'agent/llm': ['shared/schemas', 'shared/common', 'shared/env'],
  'backend/db': ['shared/schemas', 'shared/common', 'shared/env'],
  'shared/domain': ['shared/schemas'],
  'shared/schemas': [],
  'shared/env': [],
  'shared/common': [],
};
const LAYERS = Object.keys(LAYER_DEPS);

/**
 * 某一层对另一层只允许访问特定文件。
 * - frontend 对 backend/server 只能 import type AppType
 * - agent/tools 只需要图的运行上下文契约（getGraphCtx），不允许反过来依赖图本身
 */
const LAYER_EXCEPTIONS = {
  frontend: {
    'backend/server': ['./app.ts'],
    'shared/common': ['./errors.ts'],
    'shared/env': ['./client.ts'],
  },
  'agent/tools': {
    'agent/graphs': ['./config.ts'],
  },
};

const layerZones = LAYERS.flatMap((layer) => {
  const allowed = new Set([layer, ...LAYER_DEPS[layer]]);
  const forbidden = LAYERS.filter((l) => !allowed.has(l)).map((l) => ({
    target: `./src/${layer}`,
    from: `./src/${l}`,
    message: `分层约束：${layer} 不允许依赖 ${l}（见 docs/02-architecture.md §2.3）`,
  }));
  const partial = Object.entries(LAYER_EXCEPTIONS[layer] ?? {}).map(([l, except]) => ({
    target: `./src/${layer}`,
    from: `./src/${l}`,
    except,
    message: `分层约束：${layer} 只能使用 ${l} 中的 ${except.join(', ')}`,
  }));
  return [...forbidden, ...partial];
});

const FRAMEWORK_IMPORTS = {
  group: ['hono', 'hono/*', '@hono/*', 'react', 'react/*', 'react-dom', 'react-dom/*'],
  message: 'core 及以下各层不得依赖 hono / react（见 02 §2.3）',
};
const SERVER_ONLY_IMPORTS = {
  group: [
    'node:*',
    'pg',
    'pg-boss',
    'pino',
    'drizzle-orm',
    'drizzle-orm/*',
    '@langchain/*',
    '@hono/node-server',
    '@hono/node-server/*',
  ],
  message: 'frontend 不得引入 Node 专属 API 与服务端 SDK',
};

/** @param {Array<Record<string, unknown>>} patterns @param {Array<Record<string, unknown>>} [paths] */
const restrictImports = (patterns, paths = []) => ({
  '@typescript-eslint/no-restricted-imports': ['error', { patterns, paths }],
});

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'db/migrations/**',
      'db/seeds/**/*.mjs',
      'coverage/**',
      '.codebuddy/**',
      'docs/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.node },
    },
    plugins: { 'import-x': importX },
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver({ project: './tsconfig.json' })],
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'import-x/no-restricted-paths': ['error', { zones: layerZones }],
      'import-x/no-cycle': 'off',
    },
  },
  {
    files: ['eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['src/frontend/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression[callee.name=/^use(Layout)?Effect$/] > ArrowFunctionExpression.arguments:first-child[expression=true]',
          message: 'effect 回调请使用块语句：表达式简写会把返回值当成清理函数',
        },
      ],
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            SERVER_ONLY_IMPORTS,
            {
              group: ['@/backend/*', '**/backend/*'],
              allowTypeImports: true,
              message: 'frontend 对后端只允许 import type',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/backend/{core,db,jobs}/**/*.ts', 'src/agent/**/*.ts', 'src/shared/**/*.ts'],
    rules: restrictImports([FRAMEWORK_IMPORTS]),
  },
  {
    files: ['src/shared/domain/**/*.ts'],
    ignores: ['src/shared/domain/**/*.test.ts'],
    rules: restrictImports([
      {
        regex: '^(?!\\.|@/shared/schemas/)',
        message: 'domain 只允许依赖 schemas：零 IO、零三方 SDK（见 02 §2.3）',
      },
    ]),
  },
  {
    files: ['src/shared/schemas/**/*.ts'],
    ignores: ['src/shared/schemas/**/*.test.ts'],
    rules: restrictImports([{ regex: '^(?!\\.|zod$|zod/)', message: 'schemas 只允许依赖 zod' }]),
  },
  {
    files: ['src/**/*.test.ts', 'tests/**/*.ts'],
    rules: {
      'import-x/no-restricted-paths': 'off',
      '@typescript-eslint/no-restricted-imports': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
