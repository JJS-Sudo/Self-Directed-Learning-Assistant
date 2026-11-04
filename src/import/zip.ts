import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize } from 'node:path'
import JSZip from 'jszip'
import { VaultError } from '../vault/errors.js'

const MAX_SINGLE_BYTES = 10 * 1024 * 1024
const MAX_TOTAL_BYTES = 50 * 1024 * 1024

const DERIVED = [
  '.sdl-index.db',
  '.sdl-index.db-wal',
  '.sdl-index.db-shm',
  '.sdl-runs.json',
  '.sdl-secrets.json',
]

export interface ImportResult {
  imported: string[]
  skipped: { path: string; reason: string }[]
  failed: { path: string; reason: string }[]
}

function safeRelativePath(name: string): string {
  const normalized = normalize(name.replaceAll('\\', '/')).replaceAll('\\', '/')
  if (
    normalized === '' ||
    isAbsolute(normalized) ||
    normalized.split('/').some((segment) => segment === '..' || segment === '') ||
    normalized.includes(':')
  ) {
    throw new VaultError('INVALID_INPUT', `压缩包里有越界路径，已拒绝：${name}`)
  }
  return normalized
}

/** 导入 zip：已存在跳过、派生文件忽略、路径越界直接拒绝 */
export async function importZip(root: string, buffer: Buffer | Uint8Array): Promise<ImportResult> {
  if (buffer.byteLength > MAX_TOTAL_BYTES) {
    throw new VaultError('INVALID_INPUT', '压缩包超过 50MB 上限')
  }

  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(buffer)
  } catch {
    throw new VaultError('INVALID_INPUT', '不是合法的 zip 文件')
  }

  const imported: string[] = []
  const skipped: ImportResult['skipped'] = []
  const failed: ImportResult['failed'] = []

  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue
    const rel = safeRelativePath(name)

    if (DERIVED.some((derived) => rel.endsWith(derived))) {
      skipped.push({ path: rel, reason: '派生文件，已忽略' })
      continue
    }
    if (rel.split('/').some((segment) => segment === '.obsidian' || segment === '.sdl-backup')) {
      skipped.push({ path: rel, reason: '本地配置，已忽略' })
      continue
    }

    const target = join(root, rel)
    if (existsSync(target)) {
      skipped.push({ path: rel, reason: '已存在' })
      continue
    }

    try {
      const content = await entry.async('uint8array')
      if (content.byteLength > MAX_SINGLE_BYTES) {
        throw new Error('单文件超过 10MB')
      }
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, content)
      imported.push(rel)
    } catch (error) {
      failed.push({ path: rel, reason: error instanceof Error ? error.message : String(error) })
    }
  }

  return { imported, skipped, failed }
}
