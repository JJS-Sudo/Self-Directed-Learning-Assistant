import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import {
  REQUIRED_FIELDS,
  SCHEMA_VERSION,
  parseDocument,
  sanitizeFileName,
  serializeDocument,
  upsertManagedBlock,
  type Frontmatter,
} from './document.js'
import { VaultError } from './errors.js'
import { generateId } from './ids.js'
import { assertVaultUsable, resolveInsideVault } from './paths.js'

export interface WriteDocumentOptions {
  /** 库根（绝对或相对路径） */
  root: string
  /** `type` 取值，见 SOP.md 第 2 节 */
  type: string
  /** 目录 + 标题模式：生成 `{id} {title}.md` */
  dir?: string
  title?: string
  /** 显式相对路径模式：直接使用给定路径（仍受越界校验） */
  path?: string
  /** 附加 frontmatter 字段；系统所有的四个键不允许被覆盖 */
  frontmatter?: Frontmatter
  /** 正文内容，写进受管区块 */
  body?: string
  /** 指定 id（测试或迁移用）；缺省自动生成且保证库内唯一 */
  id?: string
  now?: Date
}

export interface WriteDocumentResult {
  absolutePath: string
  relativePath: string
  data: Frontmatter
}

export interface ReadDocumentResult extends WriteDocumentResult {
  content: string
  raw: string
}

export interface DocumentSummary {
  absolutePath: string
  relativePath: string
  /** 不含 `.md` 的文件名，即 `{id} {title}` */
  fileName: string
  data: Frontmatter
  content: string
}

export function writeDocument(options: WriteDocumentOptions): WriteDocumentResult {
  const root = assertVaultUsable(options.root)
  const type = requireNonEmpty(options.type, 'type')

  const requestedId = options.id?.trim() ?? ''
  const id = requestedId === '' ? nextUniqueId(root) : requestedId

  const target = resolveTarget(root, options, id)
  const existingRaw = existsSync(target) ? readFileSync(target, 'utf8') : ''
  const existingContent = existingRaw === '' ? '' : parseDocument(existingRaw).content

  const data = buildFrontmatter(options, id, type)

  const body =
    options.body === undefined ? existingContent : upsertManagedBlock(existingContent, options.body)

  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, serializeDocument(data, body), 'utf8')

  return { absolutePath: target, relativePath: relative(root, target), data }
}

export interface UpdateDocumentOptions {
  root: string
  relativePath: string
  /** 只做浅合并；四个必备字段不允许被抹掉 */
  frontmatter?: Frontmatter
  /** 写进受管区块（替换区块内部） */
  body?: string
}

/** 更新既有文档：保留原 frontmatter 与 `id`，只覆盖传入的部分 */
export function updateDocument(options: UpdateDocumentOptions): WriteDocumentResult {
  const root = assertVaultUsable(options.root)
  const target = resolveInsideVault(root, options.relativePath)

  if (!existsSync(target)) {
    throw new VaultError('NOT_FOUND', `文件不存在：${options.relativePath}`)
  }

  const parsed = parseDocument(readFileSync(target, 'utf8'))
  const data: Frontmatter = { ...parsed.data, ...(options.frontmatter ?? {}) }

  for (const field of REQUIRED_FIELDS) {
    if (data[field] === undefined) {
      throw new VaultError(
        'INVALID_INPUT',
        `更新会让必备字段 ${field} 丢失：${options.relativePath}`,
      )
    }
  }

  const body =
    options.body === undefined ? parsed.content : upsertManagedBlock(parsed.content, options.body)

  writeFileSync(target, serializeDocument(data, body), 'utf8')

  return { absolutePath: target, relativePath: relative(root, target), data }
}

export function readDocument(rootInput: string, relativePath: string): ReadDocumentResult {
  const root = assertVaultUsable(rootInput)
  const target = resolveInsideVault(root, relativePath)

  if (!existsSync(target)) {
    throw new VaultError('NOT_FOUND', `文件不存在：${relativePath}`)
  }

  const raw = readFileSync(target, 'utf8')
  const { data, content } = parseDocument(raw)

  const missing = REQUIRED_FIELDS.filter((field) => data[field] === undefined)
  if (missing.length > 0) {
    throw new VaultError('INVALID_INPUT', `缺少必备字段 ${missing.join('、')}：${relativePath}`)
  }

  return { absolutePath: target, relativePath: relative(root, target), data, content, raw }
}

/** 列出某个受管目录下的全部 Markdown 文档（不递归） */
export function listDocuments(rootInput: string, directory: string): DocumentSummary[] {
  const root = assertVaultUsable(rootInput)
  const dir = resolveInsideVault(root, directory)
  if (!existsSync(dir)) return []

  const out: DocumentSummary[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    const absolutePath = join(dir, entry.name)
    const { data, content } = parseDocument(readFileSync(absolutePath, 'utf8'))
    out.push({
      absolutePath,
      relativePath: relative(root, absolutePath),
      fileName: entry.name.replace(/\.md$/, ''),
      data,
      content,
    })
  }
  return out
}

/** 库内全部 Markdown 文件（绝对路径，递归） */
export function listMarkdownFiles(root: string): string[] {
  const out: string[] = []
  const walk = (current: string): void => {
    if (!existsSync(current)) return
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full)
    }
  }
  walk(root)
  return out
}

function buildFrontmatter(options: WriteDocumentOptions, id: string, type: string): Frontmatter {
  const title = options.title?.trim()
  return {
    ...(options.frontmatter ?? {}),
    ...(title !== undefined && title !== '' ? { title } : {}),
    id,
    type,
    schema_version: SCHEMA_VERSION,
    created_at: (options.now ?? new Date()).toISOString(),
  }
}

function resolveTarget(root: string, options: WriteDocumentOptions, id: string): string {
  const explicitPath = options.path?.trim()
  if (explicitPath !== undefined && explicitPath !== '') {
    if (!explicitPath.toLowerCase().endsWith('.md')) {
      throw new VaultError('INVALID_INPUT', `path 必须以 .md 结尾：${explicitPath}`)
    }
    return resolveInsideVault(root, explicitPath)
  }

  const dir = requireNonEmpty(options.dir ?? '', 'dir')
  const title = requireNonEmpty(options.title ?? '', 'title')
  return resolveInsideVault(root, join(dir, `${id} ${sanitizeFileName(title)}.md`))
}

function nextUniqueId(root: string): string {
  const taken = new Set<string>()
  for (const file of listMarkdownFiles(root)) {
    const base = file.split(/[\\/]/).pop() ?? ''
    const candidate = base.split(' ')[0]
    if (candidate !== undefined && candidate !== '') taken.add(candidate)
  }

  for (let attempt = 0; attempt < 200; attempt += 1) {
    const candidate = generateId()
    if (!taken.has(candidate)) return candidate
  }
  throw new VaultError('INVALID_INPUT', '无法生成唯一的 id')
}

function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim()
  if (trimmed === '') throw new VaultError('INVALID_INPUT', `${field} 不能为空`)
  return trimmed
}
