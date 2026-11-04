import { basename, join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import type { HealthReport } from '../src/shared/health.js'
import { createTempVault, createUnmarkedVault, makeTempDir, removeDir } from './helpers.js'

const tempDirs: string[] = []

function track(dir: string): string {
  tempDirs.push(dir)
  return dir
}

/** 每个用例都用显式 env，避免读到开发机上的真实 key */
function healthOf(options: { vaultPath?: string; cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  const app = createApp({ ...options, env: options.env ?? {} })
  return app.request('/api/health')
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) removeDir(dir)
})

describe('GET /api/health', () => {
  it('返回 200 与稳定的服务标识、版本号', async () => {
    const response = await healthOf({ vaultPath: track(createTempVault()) })
    const body = (await response.json()) as HealthReport

    expect(response.status).toBe(200)
    expect(body.service).toBe('self-directed-learning')
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('库正常时 vault.ok 为 true，且只回目录名、不回绝对路径', async () => {
    const vault = track(createTempVault())
    const response = await healthOf({ vaultPath: vault })
    const body = (await response.json()) as HealthReport

    expect(body.vault.ok).toBe(true)
    expect(body.vault.marked).toBe(true)
    expect(body.vault.name).toBe(basename(vault))
    expect(JSON.stringify(body)).not.toContain(vault)
    expect(body.vault).not.toHaveProperty('path')
  })

  it('库不存在时仍返回 200，只把 vault.ok 置为 false', async () => {
    const missing = join(track(makeTempDir('sdl-missing-')), 'nope')
    const response = await healthOf({ vaultPath: missing })
    const body = (await response.json()) as HealthReport

    expect(response.status).toBe(200)
    expect(body.vault.ok).toBe(false)
    expect(body.vault.marked).toBe(false)
  })

  it('目录存在但缺 .sdl-vault 标记时，ok 为 false 而 marked 也为 false', async () => {
    const vault = track(createUnmarkedVault())
    const response = await healthOf({ vaultPath: vault })
    const body = (await response.json()) as HealthReport

    expect(body.vault.ok).toBe(false)
    expect(body.vault.marked).toBe(false)
  })

  it('没有 DEEPSEEK_API_KEY 时 model.configured 为 false', async () => {
    const body = (await (
      await healthOf({ vaultPath: track(createTempVault()), env: {} })
    ).json()) as HealthReport

    expect(body.model.configured).toBe(false)
    expect(body.model.provider).toBe('deepseek')
    expect(body.model.model).toBe('deepseek-chat')
  })

  it('有 key 时 configured 为 true；SDL_LLM_MODEL 覆盖默认模型名', async () => {
    const body = (await (
      await healthOf({
        vaultPath: track(createTempVault()),
        env: { DEEPSEEK_API_KEY: 'sk-test', SDL_LLM_MODEL: 'deepseek-reasoner' },
      })
    ).json()) as HealthReport

    expect(body.model.configured).toBe(true)
    expect(body.model.model).toBe('deepseek-reasoner')
  })

  it('索引进度如实报告为 absent（阶段 1 尚未引入 SQLite）', async () => {
    const body = (await (
      await healthOf({ vaultPath: track(createTempVault()) })
    ).json()) as HealthReport

    expect(body.index.status).toBe('absent')
    expect(body.index.note).toBeTruthy()
  })

  it('库路径解析失败（.sdlrc.json 坏掉）时仍 200，并给出可读错误', async () => {
    const cwd = track(makeTempDir('sdl-badrc-'))
    writeFileSync(join(cwd, '.sdlrc.json'), '{ not json', 'utf8')

    const response = await healthOf({ cwd })
    const body = (await response.json()) as HealthReport

    expect(response.status).toBe(200)
    expect(body.vault.ok).toBe(false)
    expect(body.vault.error).toBeTruthy()
  })
})
