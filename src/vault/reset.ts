import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { VaultError } from './errors.js'
import { assertVaultUsable, resolveInsideVault } from './paths.js'

export interface ResetOptions {
  root: string
  seedsDir: string
}

export interface ResetResult {
  root: string
  seedsDir: string
  seedFiles: string[]
  deleted: string[]
  restored: string[]
}

/** 递归列出目录下的全部文件（含点文件，如 `.sdl-vault`） */
export function listFiles(dir: string): string[] {
  const out: string[] = []
  const walk = (current: string): void => {
    if (!existsSync(current)) return
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) out.push(full)
    }
  }
  walk(resolve(dir))
  return out
}

/**
 * 白名单重置：**只删除由 `seeds/` 定义的文件**，其余内容原样保留。
 *
 * 运行时库是一个活的 Obsidian 仓库 —— 里面有 `.obsidian/` 配置和用户自己写的笔记。
 * 整目录删除会毁掉它们，而 P1 还不做快照（快照属 P6），没有安全网。
 */
export function resetVault(options: ResetOptions): ResetResult {
  const root = assertVaultUsable(options.root)

  const seedsDir = resolve(options.seedsDir)
  if (!existsSync(seedsDir)) {
    throw new VaultError('INVALID_INPUT', `种子目录不存在：${seedsDir}`)
  }

  const seedFiles = listFiles(seedsDir).map((absolute) => relative(seedsDir, absolute))

  const deleted: string[] = []
  for (const relativePath of seedFiles) {
    const target = resolveInsideVault(root, relativePath)
    if (existsSync(target)) {
      rmSync(target, { force: true })
      deleted.push(relativePath)
    }
  }

  const restored: string[] = []
  for (const relativePath of seedFiles) {
    const target = resolveInsideVault(root, relativePath)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(join(seedsDir, relativePath), target)
    restored.push(relativePath)
  }

  return { root, seedsDir, seedFiles, deleted, restored }
}
