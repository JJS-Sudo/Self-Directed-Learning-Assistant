import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { findWebRoot } from './server/web-root.js'
import { resolveHost } from './server/host-guard.js'
import { bootstrapVaultIfEmpty } from './vault/bootstrap.js'
import { messageOf } from './vault/errors.js'
import { ensureVaultStructure, resolveVaultPath } from './vault/paths.js'

const port = Number(process.env['PORT'] ?? 3000)
const decision = resolveHost(process.env)

if (decision.error !== undefined) {
  console.error(`[sdl] ${decision.error}`)
  process.exitCode = 1
} else {
  const token = (process.env['SDL_ACCESS_TOKEN'] ?? '').trim()

  /**
   * 库不可用时不阻止服务启动 —— 写入与重置会在请求时被拒绝并给出可读错误。
   * 这样 `/healthz` 仍然可用，便于诊断"库没配好"这类问题。
   */
  try {
    const root = resolveVaultPath()
    // 新克隆 / 空目录：从 seeds 初始化演示库，零配置即可建第一个目标
    const bootstrap = bootstrapVaultIfEmpty(
      root,
      join(dirname(fileURLToPath(import.meta.url)), '..', 'seeds'),
    )
    if (bootstrap.created) {
      console.log(`[sdl] 首启：已从 seeds 初始化演示库（${bootstrap.copiedFiles} 个文件）`)
    }
    const result = ensureVaultStructure(root)
    const suffix = result.created.length > 0 ? `（补齐 ${result.created.length} 项）` : ''
    console.log(`[sdl] 库：${root}${suffix}`)
  } catch (error) {
    console.warn(`[sdl] 库不可用：${messageOf(error)}`)
  }

  const webRoot = findWebRoot(dirname(fileURLToPath(import.meta.url)))
  const app = createApp({
    ...(webRoot === undefined ? {} : { webRoot }),
    ...(token === ''
      ? {}
      : { accessToken: token, sessionSecret: process.env['SDL_SESSION_SECRET'] ?? '' }),
  })

  serve({ fetch: app.fetch, port, hostname: decision.host }, (info) => {
    console.log(`[sdl] 服务已启动：http://${decision.host}:${info.port}`)
    console.log(
      `[sdl] 网页：${webRoot === undefined ? '未构建（dist/web 缺失）' : webRoot}` +
        (decision.requiresAuth ? ' · 需要访问令牌（/login）' : ''),
    )
  })
}
