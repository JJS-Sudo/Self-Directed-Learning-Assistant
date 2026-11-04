#!/usr/bin/env node
/**
 * 把 Electron 主进程与内嵌服务打成 CJS：dist-electron/main.cjs
 * - 打包 Electron 主进程 + Hono 服务代码；
 * - Electron / better-sqlite3 / electron-updater 保持外部依赖（运行时由 node_modules/asar 提供）；
 * - 更新源基地址在构建时注入（CI 里由 SDL_UPDATE_BASE_URL / SDL_GITEE_UPDATE_BASE_URL 提供）。
 */
import { build } from 'esbuild'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const root = process.cwd()

/** NodeNext 的 `.js` 后缀在源码里是 `.ts`，esbuild 不会自动映射，这里补上 */
const tsResolvePlugin = {
  name: 'ts-resolve',
  setup(buildApi) {
    buildApi.onResolve({ filter: /^\.{1,2}\/.*\.js$/ }, (args) => {
      const candidate = resolve(dirname(args.importer), args.path.replace(/\.js$/, '.ts'))
      if (existsSync(candidate)) return { path: candidate }
      return undefined
    })
  },
}

await build({
  entryPoints: [resolve(root, 'electron/main.ts')],
  outfile: resolve(root, 'dist-electron/main.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: false,
  external: ['electron', 'better-sqlite3', 'electron-updater'],
  plugins: [tsResolvePlugin],
  define: {
    __SDL_GITHUB_BASE__: JSON.stringify(process.env.SDL_UPDATE_BASE_URL ?? ''),
    __SDL_GITEE_BASE__: JSON.stringify(process.env.SDL_GITEE_UPDATE_BASE_URL ?? ''),
  },
  logLevel: 'info',
})

console.log('dist-electron/main.cjs 已生成')
