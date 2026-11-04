import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { bootstrapVaultIfEmpty } from '../src/vault/bootstrap.js'

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sdl-bootstrap-'))
  dirs.push(dir)
  return dir
}

function seedsFixture(): string {
  const seeds = tempDir()
  mkdirSync(join(seeds, '00-配置'), { recursive: true })
  mkdirSync(join(seeds, '10-目标'), { recursive: true })
  writeFileSync(join(seeds, '00-配置', 'profile.md'), '# 画像\n')
  writeFileSync(join(seeds, '10-目标', '样例目标.md'), '# 目标\n')
  writeFileSync(join(seeds, '.sdl-vault'), '{}')
  return seeds
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('首启建库', () => {
  it('目录不存在时从 seeds 建库', () => {
    const seeds = seedsFixture()
    const root = join(tempDir(), 'vault')

    const result = bootstrapVaultIfEmpty(root, seeds)

    expect(result.created).toBe(true)
    expect(result.copiedFiles).toBeGreaterThanOrEqual(3)
    expect(readdirSync(join(root, '10-目标'))).toContain('样例目标.md')
    expect(readFileSync(join(root, '.sdl-vault'), 'utf8')).toContain('sdl-vault')
  })

  it('空目录也初始化', () => {
    const seeds = seedsFixture()
    const root = tempDir()

    expect(bootstrapVaultIfEmpty(root, seeds).created).toBe(true)
    expect(readdirSync(join(root, '00-配置'))).toContain('profile.md')
  })

  it('非空目录不动（交给标记检查）', () => {
    const seeds = seedsFixture()
    const root = tempDir()
    writeFileSync(join(root, '我的笔记.md'), '# 别动我\n')

    const result = bootstrapVaultIfEmpty(root, seeds)

    expect(result.created).toBe(false)
    expect(readdirSync(root)).toEqual(['我的笔记.md'])
  })

  it('seeds 不存在时安静跳过', () => {
    const root = join(tempDir(), 'vault')
    expect(bootstrapVaultIfEmpty(root, join(tempDir(), 'no-seeds')).created).toBe(false)
  })
})
