import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runIndex } from '../src/tools/index.js'
import { runMaps } from '../src/tools/maps.js'
import { runMigrate } from '../src/tools/migrate.js'
import { runReset } from '../src/tools/reset.js'
import { REPO_ROOT, createTempVault, makeTempDir, removeDir } from './helpers.js'

const dirs: string[] = []

function track(dir: string): string {
  dirs.push(dir)
  return dir
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of dirs.splice(0)) removeDir(dir)
})

describe('CLI 入口', () => {
  it('runIndex 成功返回 0，并落下索引文件', () => {
    const root = track(createTempVault())

    expect(runIndex({ env: { SDL_VAULT_PATH: root } })).toBe(0)
    expect(existsSync(join(root, '.sdl-index.db'))).toBe(true)
  })

  it('runIndex 配置坏掉时返回 1，而不是抛异常', () => {
    const cwd = track(makeTempDir('sdl-badcfg-'))
    writeFileSync(join(cwd, '.sdlrc.json'), '{ not json', 'utf8')

    expect(runIndex({ cwd })).toBe(1)
  })

  it('runMaps 成功返回 0，并生成派生物', () => {
    const root = track(createTempVault())

    expect(runMaps({ env: { SDL_VAULT_PATH: root } })).toBe(0)

    const areas = readdirSync(join(root, '20-学习项目'))
    expect(areas.length).toBeGreaterThan(0)
    expect(existsSync(join(root, '20-学习项目', areas[0] as string, '知识地图.md'))).toBe(true)
  })

  it('runReset 只按 seeds 重建，用户笔记保留', () => {
    const root = track(createTempVault())
    writeFileSync(join(root, 'user-note.md'), '# 我的笔记\n', 'utf8')

    expect(runReset({ env: { SDL_VAULT_PATH: root }, cwd: REPO_ROOT })).toBe(0)
    expect(existsSync(join(root, 'user-note.md'))).toBe(true)
    expect(existsSync(join(root, '10-目标', 'g0a1b2 精通 TypeScript 类型系统.md'))).toBe(true)
  })

  it('runMigrate 的 --dry-run 不改文件并返回 0', () => {
    const root = track(createTempVault())

    expect(runMigrate({ env: { SDL_VAULT_PATH: root }, argv: ['--dry-run'] })).toBe(0)
  })
})
