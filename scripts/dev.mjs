#!/usr/bin/env node
/**
 * `npm run dev` 的进程编排：API（3001）+ Vite（3000）。
 *
 * 不用 concurrently：在 Windows 上它启动第二个子进程时会静默丢输出，
 * 表现为「Vite 起来了、API 没起来」。这里直接 spawn，并把退出原因打出来。
 */
import { spawn } from 'node:child_process'

const isWindows = process.platform === 'win32'
const children = new Set()
let shuttingDown = false

function start(name, command, args, env) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: isWindows,
    env: { ...process.env, ...env },
  })
  children.add(child)

  child.on('exit', (code) => {
    children.delete(child)
    if (shuttingDown) return
    console.error(`[dev] ${name} 已退出（code ${code ?? 'null'}），停止其余进程`)
    shutdown(code ?? 1)
  })

  child.on('error', (error) => {
    console.error(`[dev] ${name} 启动失败：${error.message}`)
    shutdown(1)
  })

  return child
}

function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true

  for (const child of children) {
    if (child.pid === undefined) continue
    if (isWindows) {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' })
    } else {
      child.kill('SIGTERM')
    }
  }

  setTimeout(() => process.exit(code), 300)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

const apiPort = process.env['SDL_API_PORT'] ?? '3001'
console.log(`[dev] api :${apiPort} · web :3000（浏览器打开 http://localhost:3000）`)

start('api', 'npx', ['tsx', 'watch', 'src/index.ts'], { PORT: apiPort })
start('web', 'npx', ['vite'], {})
