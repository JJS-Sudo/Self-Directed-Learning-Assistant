import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import JSZip from 'jszip'

const EXCLUDED_NAMES = new Set([
  '.sdl-index.db',
  '.sdl-index.db-wal',
  '.sdl-index.db-shm',
  '.sdl-runs.json',
  '.sdl-secrets.json',
  '.obsidian',
  '.sdl-backup',
  '.git',
  'seeds',
])

export interface ExportOptions {
  /** 只导出这个目标（10-目标 的文件与 20-学习项目 的目录） */
  goalId?: string
  /** 是否包含 .canvas */
  includeCanvas?: boolean
}

function isExcluded(relativePath: string): boolean {
  return relativePath.split('/').some((segment) => EXCLUDED_NAMES.has(segment))
}

function includedByGoal(relativePath: string, goalId: string): boolean {
  if (relativePath.startsWith('00-配置/')) return true
  if (relativePath.startsWith('10-目标/')) {
    return relativePath.slice('10-目标/'.length).startsWith(`${goalId} `)
  }
  if (relativePath.startsWith('20-学习项目/')) {
    return relativePath.slice('20-学习项目/'.length).startsWith(goalId)
  }
  // 资源不按目标分区，整库带出更稳妥
  return relativePath.startsWith('40-资源/')
}

export function listVaultFiles(root: string, options: ExportOptions = {}): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      const rel = relative(root, full).split('\\').join('/')
      if (isExcluded(rel)) continue
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!options.includeCanvas && rel.endsWith('.canvas')) continue
      if (options.goalId !== undefined && !includedByGoal(rel, options.goalId)) continue
      out.push(rel)
    }
  }
  walk(root)
  return out.sort()
}

export async function buildExportZip(root: string, options: ExportOptions = {}): Promise<Buffer> {
  const zip = new JSZip()
  for (const rel of listVaultFiles(root, options)) {
    zip.file(rel, readFileSync(join(root, rel)))
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}
