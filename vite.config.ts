import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * dev：浏览器只认 3000（Vite），`/api` 代理到 3001（Hono）。
 * prod：`vite build` 产出 `dist/web`，交给 Hono 托管，端口回到 3000。
 */
export default defineConfig({
  root: 'web',
  plugins: [react()],
  resolve: {
    alias: {
      // 运行时值（不只是类型）也要能解析，例如 @shared/resources 的 UI 词表
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
    },
  },
  server: {
    port: 3000,
    strictPort: true,
    // OneDrive 上原子写会留下临时目录；watcher 去监听它们会 EBUSY 直接崩掉
    watch: {
      ignored: ['**/.*.tmpdir/**', '**/.*.tmp', '**/*.tmpdir/**'],
    },
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
  },
})
