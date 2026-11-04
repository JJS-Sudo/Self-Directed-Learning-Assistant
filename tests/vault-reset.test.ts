import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resetVault } from '../src/vault/reset.js'
import {
  SEEDS_DIR,
  createTempVault,
  createUnmarkedVault,
  relativeFileList,
  removeDir,
  vaultErrorCode,
} from './helpers.js'

const tempDirs: string[] = []

function track(dir: string): string {
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) removeDir(dir)
})

describe('reset 的白名单语义', () => {
  it('只重建 seeds 定义的文件，非受管文件原样保留', () => {
    const root = track(createTempVault())

    mkdirSync(join(root, '.obsidian'), { recursive: true })
    writeFileSync(join(root, '.obsidian', 'app.json'), '{"legacyEditor":false}', 'utf8')
    writeFileSync(join(root, '欢迎.md'), '# 欢迎\n', 'utf8')

    const seeded = join(root, '10-目标', 'g0a1b2 精通 TypeScript 类型系统.md')
    writeFileSync(seeded, '被改乱了', 'utf8')

    resetVault({ root, seedsDir: SEEDS_DIR })

    expect(existsSync(join(root, '.obsidian', 'app.json'))).toBe(true)
    expect(readFileSync(join(root, '.obsidian', 'app.json'), 'utf8')).toBe('{"legacyEditor":false}')
    expect(existsSync(join(root, '欢迎.md'))).toBe(true)

    const fromSeeds = readFileSync(
      join(SEEDS_DIR, '10-目标', 'g0a1b2 精通 TypeScript 类型系统.md'),
      'utf8',
    )
    expect(readFileSync(seeded, 'utf8')).toBe(fromSeeds)
  })

  it('reset 后，由 seeds 定义的文件逐项一致', () => {
    const root = track(createTempVault())

    rmSync(join(root, '20-学习项目'), { recursive: true, force: true })
    rmSync(join(root, '00-配置', 'profile.md'), { force: true })

    resetVault({ root, seedsDir: SEEDS_DIR })

    const seededFiles = relativeFileList(SEEDS_DIR)
    const presentInVault = relativeFileList(root).filter((path) => seededFiles.includes(path))

    expect(presentInVault).toEqual(seededFiles)
    expect(existsSync(join(root, '20-学习项目'))).toBe(true)
    expect(existsSync(join(root, '00-配置', 'profile.md'))).toBe(true)
  })

  it('缺少 .sdl-vault 标记时拒绝 reset，且不改动任何文件', () => {
    const unmarked = track(createUnmarkedVault())
    const before = relativeFileList(unmarked)

    expect(vaultErrorCode(() => resetVault({ root: unmarked, seedsDir: SEEDS_DIR }))).toBe(
      'MARKER_MISSING',
    )
    expect(relativeFileList(unmarked)).toEqual(before)
  })

  it('种子目录不存在时报可读错误', () => {
    const root = track(createTempVault())

    expect(
      vaultErrorCode(() => resetVault({ root, seedsDir: join(root, '不存在的种子目录') })),
    ).toBe('INVALID_INPUT')
  })
})
