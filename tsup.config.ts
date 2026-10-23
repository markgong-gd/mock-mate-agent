import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { entry: 'src/backend/server/entry.ts', migrate: 'src/backend/db/migrate-cli.ts' },
  outDir: 'dist/server',
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  clean: true,
  splitting: false,
});
