import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MARKER_FILE } from './paths.js'

export interface BootstrapResult {
  created: boolean
  copiedFiles: number
  root: string
}

const MARKER_CONTENT = `${JSON.stringify({ marker: 'sdl-vault', schema_version: 1 })}\n`

function countFiles(dir: string): number {
  let count = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue
    const absolute = join(dir, entry.name)
    if (entry.isDirectory()) count += countFiles(absolute)
    else if (entry.isFile()) count += 1
  }
  return count
}

/**
 * 首启建库：**只在目录不存在或为空时**从 seeds 初始化。
 * 非空目录一律不动（哪怕看起来像库）——是否合法交给 ensureVaultStructure 的标记检查。
 * 这样既能让新克隆零配置跑起来，也绝不会覆盖用户已有的学习数据。
 */
export function bootstrapVaultIfEmpty(root: string, seedsDir: string): BootstrapResult {
  const exists = existsSync(root)
  if (exists && !statSync(root).isDirectory()) {
    return { created: false, copiedFiles: 0, root }
  }
  if (exists && readdirSync(root).length > 0) {
    return { created: false, copiedFiles: 0, root }
  }
  if (!existsSync(seedsDir) || !statSync(seedsDir).isDirectory()) {
    return { created: false, copiedFiles: 0, root }
  }

  mkdirSync(root, { recursive: true })
  cpSync(seedsDir, root, { recursive: true })
  // 强制写一份规范标记（seeds 里的标记内容可能不同）
  writeFileSync(join(root, MARKER_FILE), MARKER_CONTENT, 'utf8')

  return { created: true, copiedFiles: countFiles(root), root }
}
