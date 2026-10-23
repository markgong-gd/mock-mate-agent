import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // 开发服务器与后端端口均可由 .env 配置（shell 环境变量优先）
  const env = { ...loadEnv(mode, import.meta.dirname, ['PORT', 'DEV_']), ...process.env };
  const serverPort = Number(env.PORT ?? 3000);

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, 'src') },
    },
    server: {
      host: env.DEV_HOST ?? 'localhost',
      port: Number(env.DEV_PORT ?? 5173),
      proxy: {
        '/api': { target: `http://localhost:${serverPort}`, changeOrigin: false },
      },
    },
    build: {
      outDir: 'dist/client',
      emptyOutDir: true,
    },
  };
});
