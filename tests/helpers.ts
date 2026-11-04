import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { VaultError, type VaultErrorCode } from '../src/vault/errors.js'
import { ensureVaultStructure } from '../src/vault/paths.js'

export const REPO_ROOT = join(import.meta.dirname, '..')
export const SEEDS_DIR = join(REPO_ROOT, 'seeds')

export function makeTempDir(prefix = 'sdl-test-'): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

export function removeDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
}

export function copySeedsInto(target: string): void {
  mkdirSync(target, { recursive: true })
  for (const entry of readdirSync(SEEDS_DIR, { withFileTypes: true })) {
    cpSync(join(SEEDS_DIR, entry.name), join(target, entry.name), { recursive: true })
  }
}

/** 一个与 seeds 完全一致的临时库（含 `.sdl-vault` 标记） */
export function createTempVault(): string {
  const dir = makeTempDir('sdl-vault-')
  copySeedsInto(dir)
  return dir
}

/** 一个空库：8 个目录 + `profile.md` + 标记，但没有任何目标或节点 */
export function createEmptyVault(): string {
  const dir = makeTempDir('sdl-empty-')
  writeFileSync(join(dir, '.sdl-vault'), '{"marker":"sdl-vault","schema_version":1}\n', 'utf8')
  ensureVaultStructure(dir)
  return dir
}

/** 一个已存在、但缺 `.sdl-vault` 标记、且带用户笔记的目录 */
export function createUnmarkedVault(): string {
  const dir = makeTempDir('sdl-unmarked-')
  writeFileSync(join(dir, 'user-note.md'), '# 用户自己的笔记\n', 'utf8')
  return dir
}

/** 相对路径清单（统一成正斜杠并排序），便于逐项比对 */
export function relativeFileList(root: string): string[] {
  const out: string[] = []
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else out.push(relative(root, full).split(sep).join('/'))
    }
  }
  walk(root)
  return out.sort()
}

/** 执行并返回 VaultError 的 code；没抛错返回 'NO_ERROR'，抛别的错原样抛出 */
export function vaultErrorCode(run: () => unknown): VaultErrorCode | 'NO_ERROR' {
  try {
    run()
    return 'NO_ERROR'
  } catch (error) {
    if (error instanceof VaultError) return error.code
    throw error
  }
}
