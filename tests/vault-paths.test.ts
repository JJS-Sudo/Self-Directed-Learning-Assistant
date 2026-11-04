import { existsSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  MANAGED_DIRS,
  ensureVaultStructure,
  resolveInsideVault,
  resolveVaultPath,
} from '../src/vault/paths.js'
import { makeTempDir, removeDir, vaultErrorCode } from './helpers.js'

const tempDirs: string[] = []

function track(dir: string): string {
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) removeDir(dir)
})

describe('库路径解析优先级', () => {
  it('SDL_VAULT_PATH > .sdlrc.json > 默认 ./vault', () => {
    const cwd = track(makeTempDir('sdl-cwd-'))
    writeFileSync(join(cwd, '.sdlrc.json'), JSON.stringify({ vaultPath: './from-config' }), 'utf8')

    expect(resolveVaultPath({ env: { SDL_VAULT_PATH: './from-env' }, cwd })).toBe(
      resolve(cwd, 'from-env'),
    )
    expect(resolveVaultPath({ env: {}, cwd })).toBe(resolve(cwd, 'from-config'))

    const bare = track(makeTempDir('sdl-bare-'))
    expect(resolveVaultPath({ env: {}, cwd: bare })).toBe(resolve(bare, 'vault'))
  })

  it('空字符串的 SDL_VAULT_PATH 视为未设置', () => {
    const cwd = track(makeTempDir('sdl-empty-env-'))
    expect(resolveVaultPath({ env: { SDL_VAULT_PATH: '   ' }, cwd })).toBe(resolve(cwd, 'vault'))
  })

  it('.sdlrc.json 不是合法 JSON 时明确报错', () => {
    const cwd = track(makeTempDir('sdl-bad-config-'))
    writeFileSync(join(cwd, '.sdlrc.json'), '{ 这不是 JSON', 'utf8')

    expect(vaultErrorCode(() => resolveVaultPath({ env: {}, cwd }))).toBe('INVALID_INPUT')
  })
})

describe('目录骨架', () => {
  it('库不存在时创建 8 个目录、profile.md 与标记文件', () => {
    const root = join(track(makeTempDir('sdl-new-')), 'vault')
    const result = ensureVaultStructure(root)

    expect(result.createdRoot).toBe(true)
    for (const dir of MANAGED_DIRS) {
      expect(existsSync(join(root, dir)), dir).toBe(true)
    }
    expect(existsSync(join(root, '00-配置', 'profile.md'))).toBe(true)
    expect(existsSync(join(root, '.sdl-vault'))).toBe(true)
  })

  it('库已存在且带标记时是幂等的', () => {
    const root = join(track(makeTempDir('sdl-idem-')), 'vault')
    ensureVaultStructure(root)
    const second = ensureVaultStructure(root)

    expect(second.createdRoot).toBe(false)
    expect(second.created).toEqual([])
  })

  it('已存在但缺标记的目录被拒绝，不静默认领', () => {
    const root = track(makeTempDir('sdl-unmarked-'))

    expect(vaultErrorCode(() => ensureVaultStructure(root))).toBe('MARKER_MISSING')
    expect(existsSync(join(root, '.sdl-vault'))).toBe(false)
  })
})

describe('写路径越界校验', () => {
  it('拒绝越出库根的路径', () => {
    const root = track(makeTempDir('sdl-guard-'))

    expect(vaultErrorCode(() => resolveInsideVault(root, '../../outside.md'))).toBe(
      'PATH_OUTSIDE_VAULT',
    )
    expect(vaultErrorCode(() => resolveInsideVault(root, join('..', 'sibling.md')))).toBe(
      'PATH_OUTSIDE_VAULT',
    )
  })

  it('放行库内的正常路径', () => {
    const root = track(makeTempDir('sdl-inside-'))
    const target = resolveInsideVault(root, join('10-目标', 'x.md'))

    expect(target).toBe(resolve(root, '10-目标', 'x.md'))
  })

  it('空路径被拒绝', () => {
    const root = track(makeTempDir('sdl-blank-'))
    expect(vaultErrorCode(() => resolveInsideVault(root, '   '))).toBe('INVALID_INPUT')
  })
})
