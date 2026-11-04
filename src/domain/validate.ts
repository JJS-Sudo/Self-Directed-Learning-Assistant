import { VaultError } from '../vault/errors.js'

/** 领域层入参校验的公共小工具。所有失败都是 `INVALID_INPUT`，由 errors.ts 统一映射成 400。 */

export function requireText(value: unknown, field: string): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (text === '') throw new VaultError('INVALID_INPUT', `${field} 不能为空`)
  return text
}

export function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') {
    throw new VaultError('INVALID_INPUT', `${field} 必须是字符串`)
  }
  const text = value.trim()
  return text === '' ? undefined : text
}

export function requirePositiveInt(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new VaultError('INVALID_INPUT', `${field} 必须是正整数`)
  }
  return parsed
}

export function optionalPositiveInt(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return requirePositiveInt(value, field)
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * `date` 一律是 `YYYY-MM-DD` 的**本地日**，不带时区（SOP.md 第 5.3 节的日期约定）。
 * 除了格式，还要拒绝 `2026-02-30` 这类格式合法但不存在的日期。
 */
export function requireCalendarDate(value: unknown, field: string): string {
  const text = typeof value === 'string' ? value.trim() : ''
  const match = DATE_PATTERN.exec(text)
  if (match === null) {
    throw new VaultError(
      'INVALID_INPUT',
      `${field} 必须是 YYYY-MM-DD 形式（不带时区），收到「${text}」`,
    )
  }

  const year = Number(match[1] ?? '')
  const month = Number(match[2] ?? '')
  const day = Number(match[3] ?? '')
  const parsed = new Date(Date.UTC(year, month - 1, day))
  const real =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day

  if (!real) {
    throw new VaultError('INVALID_INPUT', `${field} 不是真实存在的日期：${text}`)
  }
  return text
}

/** 学习日历上的"今天"（本地日） */
export function todayLocal(now: Date = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** 标签：接受字符串（用 `,` `，` `、` 分隔）或字符串数组；去空、去重、保序 */
export function optionalTextArray(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return []

  const raw: unknown[] = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,，、]/)
      : []
  if (!Array.isArray(value) && typeof value !== 'string') {
    throw new VaultError('INVALID_INPUT', `${field} 必须是字符串或字符串数组`)
  }

  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') {
      throw new VaultError('INVALID_INPUT', `${field} 的每一项都必须是字符串`)
    }
    const text = item.trim()
    if (text !== '' && !out.includes(text)) out.push(text)
  }
  return out
}

/** id 列表（例如复盘的 `adjust_events`）：接受单个字符串或字符串数组，去重保序 */
export function requireIdList(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return []
  if (typeof value !== 'string' && !Array.isArray(value)) {
    throw new VaultError('INVALID_INPUT', `${field} 必须是字符串或字符串数组`)
  }
  const raw: unknown[] = Array.isArray(value) ? value : [value]
  const out: string[] = []
  for (const item of raw) {
    const text = requireText(item, field)
    if (!out.includes(text)) out.push(text)
  }
  return out
}

/**
 * 文本列表（例如路径段的"检验信号"）：接受单条文本或文本数组，
 * **至少要有一条非空** —— 写不出可判定的检验信号，就说明这一段还没定义好。
 */
export function requireTextList(value: unknown, field: string): string[] {
  if (value === undefined || value === null) {
    throw new VaultError('INVALID_INPUT', `${field} 至少要有一条非空内容`)
  }
  if (typeof value !== 'string' && !Array.isArray(value)) {
    throw new VaultError('INVALID_INPUT', `${field} 必须是文本或文本数组`)
  }
  const raw: unknown[] = Array.isArray(value) ? value : [value]
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') {
      throw new VaultError('INVALID_INPUT', `${field} 的每一项都必须是文本`)
    }
    const text = item.trim()
    if (text !== '') out.push(text)
  }
  if (out.length === 0) {
    throw new VaultError('INVALID_INPUT', `${field} 至少要有一条非空内容`)
  }
  return out
}

/**
 * 读路径专用的**宽容**版本：库里的文件是用户能用 Obsidian 手改的，
 * 手改坏了只该让这一个文件不参与索引（SOP.md 第 5.6 节的所有权约定），
 * 不该让整页读取抛错。
 */
export function lenientTextArray(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const text = item.trim()
    if (text !== '' && !out.includes(text)) out.push(text)
  }
  return out
}

/** 读路径专用：非法或缺失一律当作「没有这个值」 */
export function lenientPositiveInt(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

/** 读路径专用：非法或缺失一律回落给定默认值 */
export function lenientNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}
