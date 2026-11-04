#!/usr/bin/env node
/**
 * 用 seeds 演示库起一个临时服务，截图给 README 用。
 * 不读取、不写入真实的私人学习库。
 *
 * 用法：npm run screenshots
 * 前置：npm run build（需要 dist/index.js 与 dist/web）
 */
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const repo = dirname(dirname(fileURLToPath(import.meta.url)))
const shots = join(repo, 'docs', 'screenshots')
const port = 3107
const base = `http://127.0.0.1:${port}`

function waitFor(url, timeoutMs = 30_000) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const response = await fetch(url)
        if (response.ok) return resolve()
      } catch {
        /* 还没起来 */
      }
      if (Date.now() - started > timeoutMs) return reject(new Error(`等待超时：${url}`))
      setTimeout(tick, 500)
    }
    void tick()
  })
}

async function main() {
  if (!existsSync(join(repo, 'dist', 'index.js'))) {
    throw new Error('缺少 dist/index.js，请先 npm run build')
  }
  mkdirSync(shots, { recursive: true })

  const shotRoot = mkdtempSync(join(tmpdir(), 'sdl-shots-'))
  const vault = join(shotRoot, '示例库')
  mkdirSync(vault)
  cpSync(join(repo, 'seeds'), vault, { recursive: true })

  const server = spawn(process.execPath, [join(repo, 'dist', 'index.js')], {
    cwd: repo,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      SDL_VAULT_PATH: vault,
    },
    stdio: 'ignore',
  })

  let browser
  try {
    await waitFor(`${base}/healthz`)
    // 预热一次目标列表，让演示库的索引先建好，截图里自检不会显示“未建立”
    await fetch(`${base}/api/goals`).catch(() => undefined)
    browser = await chromium.launch()

    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
    })
    await context.addInitScript(() => {
      localStorage.setItem('sdl-welcome-seen', '1')
    })
    const page = await context.newPage()

    await page.goto(base, { waitUntil: 'networkidle' })
    await page.waitForSelector('.area-title', { timeout: 15_000 })
    await page.screenshot({ path: join(shots, 'home.png'), fullPage: true })

    await page.goto(`${base}/map`, { waitUntil: 'networkidle' })
    await page
      .selectOption('.map-controls select', { label: '精通 TypeScript 类型系统' })
      .catch(() => undefined)
    await page.waitForSelector('.map-card', { timeout: 15_000 }).catch(() => undefined)
    await page.click('.react-flow__controls-fitview').catch(() => undefined)
    await page.waitForTimeout(800)
    await page.evaluate(() => globalThis.scrollTo(0, 0))
    await page.screenshot({ path: join(shots, 'map.png') })

    await page.goto(`${base}/path`, { waitUntil: 'networkidle' })
    await page
      .selectOption('.map-controls select', { label: '精通 TypeScript 类型系统' })
      .catch(() => undefined)
    await page.waitForSelector('.path-stage-card', { timeout: 15_000 }).catch(() => undefined)
    await page.evaluate(() => globalThis.scrollTo(0, 0))
    await page.screenshot({ path: join(shots, 'path.png') })

    await page.goto(`${base}/quality`, { waitUntil: 'networkidle' })
    await page.waitForSelector('.area-title', { timeout: 15_000 })
    await page.screenshot({ path: join(shots, 'quality.png'), fullPage: true })

    // 欢迎弹窗单独截一张（新上下文，不预置 localStorage）
    const fresh = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const welcomePage = await fresh.newPage()
    await welcomePage.goto(base, { waitUntil: 'networkidle' })
    await welcomePage.waitForSelector('.welcome-card', { timeout: 15_000 })
    await welcomePage.screenshot({ path: join(shots, 'welcome.png') })
    await fresh.close()

    await context.close()
    console.log(`截图已写入 ${shots}`)
  } finally {
    if (browser !== undefined) await browser.close().catch(() => undefined)
    server.kill()
    rmSync(shotRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
