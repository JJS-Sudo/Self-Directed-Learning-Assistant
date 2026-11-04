import matter from 'gray-matter'

export const SCHEMA_VERSION = 1

/** 全实体必备字段（见 SOP.md 第 2 节） */
export const REQUIRED_FIELDS = ['id', 'type', 'schema_version', 'created_at'] as const

/** 受管区块标记：系统只在这两者之间写正文，区块外是用户的地盘 */
export const MANAGED_BEGIN = '<!-- sdl:begin -->'
export const MANAGED_END = '<!-- sdl:end -->'

export type Frontmatter = Record<string, unknown>

export interface ParsedDocument {
  data: Frontmatter
  content: string
}

export function parseDocument(raw: string): ParsedDocument {
  const parsed = matter(raw)
  return { data: parsed.data as Frontmatter, content: parsed.content }
}

/** Windows 保留字符 */
const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|]/g
/** wikilink 语法字符：文件名含它们会让 `[[目标|显示名]]` 无法解析 */
const WIKILINK_UNSAFE_CHARS = /[[\]]/g
const DATE_LIKE_LINE = /^(\s*[A-Za-z0-9_-]+:\s*)(\d{4}-\d{2}-\d{2}(?:[T ][^\s#]*)?)\s*$/
const WIKILINK_FULL = /^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/
const WIKILINK_ANY = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g

/** 把标题变成可用的文件名片段：非法字符转义、折叠空白、去掉结尾的点与空格 */
export function sanitizeFileName(title: string): string {
  const cleaned = title
    .replace(ILLEGAL_FILENAME_CHARS, '_')
    .replace(WIKILINK_UNSAFE_CHARS, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/, '')
  const safe = cleaned === '' ? 'untitled' : cleaned
  return safe.slice(0, 80)
}

/** 链接目标：必须与磁盘文件名逐字一致，否则 Obsidian 解析不到 */
export function wikilinkTarget(id: string, title: string): string {
  return `${id} ${sanitizeFileName(title)}`
}

export function wikilink(id: string, title: string): string {
  const display = sanitizeFileName(title)
  return `[[${wikilinkTarget(id, title)}|${display}]]`
}

/** 从 `[[目标|显示名]]` 里取出目标字符串 */
export function linkTarget(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const match = WIKILINK_FULL.exec(value.trim())
  return match?.[1]
}

/** 从 wikilink 里取出 `{id}` 前缀 —— 引用字段一律存链接，相等判断靠这个 */
export function linkId(value: unknown): string | undefined {
  const target = linkTarget(value)
  if (target === undefined) return undefined
  const id = target.split(' ')[0]
  return id === undefined || id === '' ? undefined : id
}

/** 取出文本里所有 wikilink 的目标 */
export function findWikilinks(text: string): string[] {
  const out: string[] = []
  for (const match of text.matchAll(WIKILINK_ANY)) {
    const target = match[1]
    if (target !== undefined && target !== '') out.push(target)
  }
  return out
}

/** 取出受管区块内的内容；没有区块时返回 undefined */
export function extractManagedBlock(content: string): string | undefined {
  const start = content.indexOf(MANAGED_BEGIN)
  const end = content.indexOf(MANAGED_END)
  if (start === -1 || end === -1 || end <= start) return undefined
  return content.slice(start + MANAGED_BEGIN.length, end).trim()
}

export function serializeDocument(data: Frontmatter, body: string): string {
  const rendered = matter.stringify(ensureTrailingNewline(body), data)
  return quoteDateLikeScalarsInFrontmatter(rendered)
}

/** 在受管区块内写入内容；已有区块则替换其内部，区块外的内容原样保留 */
export function upsertManagedBlock(existing: string, content: string): string {
  const block = [MANAGED_BEGIN, content.trim(), MANAGED_END].join('\n')

  const start = existing.indexOf(MANAGED_BEGIN)
  const end = existing.indexOf(MANAGED_END)
  if (start !== -1 && end !== -1 && end > start) {
    return `${existing.slice(0, start)}${block}${existing.slice(end + MANAGED_END.length)}`
  }

  const head = existing.trim()
  return head === '' ? `${block}\n` : `${head}\n\n${block}\n`
}

function ensureTrailingNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`
}

/**
 * YAML 会把不加引号的 `2026-09-29` 解析成 Date 对象，破坏"日期是字符串"的约定。
 * 这里给 frontmatter 里裸露的日期值补上引号（js-yaml 通常已经加了，这是兜底）。
 */
function quoteDateLikeScalarsInFrontmatter(raw: string): string {
  const lines = raw.split('\n')
  if (lines[0] !== '---') return raw

  const closeIndex = lines.findIndex((line, index) => index > 0 && line === '---')
  if (closeIndex === -1) return raw

  for (let index = 1; index < closeIndex; index += 1) {
    const line = lines[index]
    if (line === undefined) continue
    lines[index] = line.replace(
      DATE_LIKE_LINE,
      (_match, key: string, value: string) => `${key}"${value}"`,
    )
  }

  return lines.join('\n')
}
