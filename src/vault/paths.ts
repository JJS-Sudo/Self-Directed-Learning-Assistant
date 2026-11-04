import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, normalize, resolve, sep } from 'node:path'
import { SCHEMA_VERSION, serializeDocument, type Frontmatter } from './document.js'
import { VaultError } from './errors.js'
import { generateId } from './ids.js'

export const CONFIG_FILE = '.sdlrc.json'
export const DEFAULT_VAULT_PATH = './vault'
export const MARKER_FILE = '.sdl-vault'
export const PROFILE_RELATIVE_PATH = join('00-配置', 'profile.md')

/** 库的目录骨架：目标与资源平铺，其余实体按目标分区放在 `20-学习项目/` 里 */
export const MANAGED_DIRS = ['00-配置', '10-目标', '20-学习项目', '40-资源'] as const

/** 目标分区所在目录（每个目标一个子目录，下辖知识网 / 学习路径 / 验收 / 复盘） */
export const AREAS_DIR = '20-学习项目'

export interface ResolveOptions {
  env?: NodeJS.ProcessEnv
  cwd?: string
}

/**
 * 库路径优先级：`SDL_VAULT_PATH` > `.sdlrc.json` 的 `vaultPath` > 默认 `./vault`。
 * 环境变量优先，便于测试注入临时库、便于演示切换库。
 */
export function resolveVaultPath(options: ResolveOptions = {}): string {
  const env = options.env ?? process.env
  const cwd = options.cwd ?? process.cwd()

  const fromEnv = env['SDL_VAULT_PATH']
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') {
    return resolve(cwd, fromEnv.trim())
  }

  const fromConfig = readConfiguredVaultPath(cwd)
  if (fromConfig !== undefined) {
    return resolve(cwd, fromConfig)
  }

  return resolve(cwd, DEFAULT_VAULT_PATH)
}

function readConfiguredVaultPath(cwd: string): string | undefined {
  const file = join(cwd, CONFIG_FILE)
  if (!existsSync(file)) return undefined

  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    throw new VaultError('INVALID_INPUT', `${CONFIG_FILE} 不是合法 JSON：${file}`)
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new VaultError('INVALID_INPUT', `${CONFIG_FILE} 必须是 JSON 对象：${file}`)
  }

  const value = (parsed as { vaultPath?: unknown }).vaultPath
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.trim() === '') {
    throw new VaultError('INVALID_INPUT', `${CONFIG_FILE} 的 vaultPath 必须是非空字符串：${file}`)
  }
  return value.trim()
}

export interface VaultState {
  path: string
  exists: boolean
  isDirectory: boolean
  marked: boolean
}

export function inspectVault(root: string): VaultState {
  const exists = existsSync(root)
  const isDirectory = exists && statSync(root).isDirectory()
  return {
    path: root,
    exists,
    isDirectory,
    marked: isDirectory && existsSync(join(root, MARKER_FILE)),
  }
}

/** 写入与重置的前置条件：库存在、且带 `.sdl-vault` 标记 */
export function assertVaultUsable(root: string): string {
  const state = inspectVault(root)
  if (!state.exists || !state.isDirectory) {
    throw new VaultError('VAULT_MISSING', `库不存在或不是目录：${root}`)
  }
  if (!state.marked) {
    throw new VaultError('MARKER_MISSING', `库根缺少 ${MARKER_FILE} 标记，已拒绝操作：${root}`)
  }
  return resolve(root)
}

/** 写路径校验：规范化后必须在库根之内，否则拒绝 */
export function resolveInsideVault(root: string, candidate: string): string {
  if (typeof candidate !== 'string' || candidate.trim() === '') {
    throw new VaultError('INVALID_INPUT', '路径不能为空')
  }
  const trimmed = candidate.trim()
  const target = isAbsolute(trimmed) ? normalize(trimmed) : resolve(resolve(root), trimmed)
  if (!isInsideVault(root, target)) {
    throw new VaultError('PATH_OUTSIDE_VAULT', `路径越出库根，已拒绝：${candidate}`)
  }
  return target
}

function isInsideVault(root: string, target: string): boolean {
  const rootAbs = comparable(resolve(root))
  const targetAbs = comparable(resolve(target))
  if (targetAbs === rootAbs) return true
  const prefix = rootAbs.endsWith(sep) ? rootAbs : `${rootAbs}${sep}`
  return targetAbs.startsWith(prefix)
}

function comparable(path: string): string {
  return process.platform === 'win32' ? path.toLowerCase() : path
}

export interface EnsureResult {
  root: string
  createdRoot: boolean
  created: string[]
}

/**
 * 目录骨架就位。
 * - 库不存在 → 新建（含标记文件）
 * - 库已存在但缺标记 → 拒绝（不静默认领别人的目录）
 * - 库已存在且有标记 → 只补缺失的目录与 `profile.md`
 */
export function ensureVaultStructure(root: string): EnsureResult {
  const rootAbs = resolve(root)
  const created: string[] = []
  let createdRoot = false

  if (!existsSync(rootAbs)) {
    mkdirSync(rootAbs, { recursive: true })
    createdRoot = true
    writeMarker(rootAbs)
    created.push(MARKER_FILE)
  } else {
    if (!statSync(rootAbs).isDirectory()) {
      throw new VaultError('VAULT_MISSING', `库路径不是目录：${rootAbs}`)
    }
    if (!existsSync(join(rootAbs, MARKER_FILE))) {
      throw new VaultError(
        'MARKER_MISSING',
        `库根缺少 ${MARKER_FILE} 标记，拒绝在其上创建骨架：${rootAbs}`,
      )
    }
  }

  for (const dir of MANAGED_DIRS) {
    const absolute = join(rootAbs, dir)
    if (!existsSync(absolute)) {
      mkdirSync(absolute, { recursive: true })
      created.push(dir)
    }
  }

  const profile = join(rootAbs, PROFILE_RELATIVE_PATH)
  if (!existsSync(profile)) {
    writeFileSync(profile, buildProfileTemplate(), 'utf8')
    created.push(PROFILE_RELATIVE_PATH)
  }

  return { root: rootAbs, createdRoot, created }
}

function writeMarker(root: string): void {
  const payload = {
    marker: 'sdl-vault',
    schema_version: SCHEMA_VERSION,
    created_at: new Date().toISOString(),
  }
  writeFileSync(join(root, MARKER_FILE), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

function buildProfileTemplate(now: Date = new Date()): string {
  const data: Frontmatter = {
    id: generateId(),
    type: 'profile',
    schema_version: SCHEMA_VERSION,
    created_at: now.toISOString(),
    level: '入门',
    media_preference: '不限',
    time_budget: 5,
  }
  const body = '# 学习者画像\n\n排序打分读取本文件；字段语义见 SOP.md 第 2 节。\n'
  return serializeDocument(data, body)
}
