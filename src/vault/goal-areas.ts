import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { sanitizeFileName } from './document.js'
import { VaultError } from './errors.js'
import { listDocuments, type DocumentSummary } from './io.js'
import { AREAS_DIR, assertVaultUsable, resolveInsideVault } from './paths.js'

/**
 * 目标分区：**每个目标一个目录**，下辖四类实体的子目录；
 * 生成物（`知识地图.md/.canvas` 等）放在分区根，与实体分开。
 *
 * ```
 * 20-学习项目/<目标id> <目标标题>/
 * ├─ 知识网/     MapNode 实体
 * ├─ 学习路径/   PathStage 实体
 * ├─ 验收/       Question 实体 + Assessment 记录
 * └─ 复盘/       Retrospective 实体
 * ```
 *
 * 目标本体与资源**不进分区**：前者要能全局列出，后者会被多个目标复用。
 */

export const AREA_SUBDIRS = ['知识网', '学习路径', '验收', '复盘'] as const
export type AreaSubdir = (typeof AREA_SUBDIRS)[number]

export interface GoalRef {
  id: string
  title: string
}

/** 分区目录名：`{id} {清洗后的标题}`，与实体文件名同一套转义规则 */
export function goalAreaName(goal: GoalRef): string {
  return `${goal.id} ${sanitizeFileName(goal.title)}`
}

export function goalAreaRelativePath(goal: GoalRef): string {
  return join(AREAS_DIR, goalAreaName(goal))
}

export function areaSubdirRelativePath(goal: GoalRef, subdir: AreaSubdir): string {
  return join(goalAreaRelativePath(goal), subdir)
}

export interface EnsureAreaResult {
  relativePath: string
  created: string[]
}

/**
 * 建区（幂等）。目标标题改过、分区目录却还是旧名时**报错而不是静默留孤儿** ——
 * 否则库里会同时存在新旧两个分区，数据就分叉了。
 */
export function ensureGoalArea(rootInput: string, goal: GoalRef): EnsureAreaResult {
  const root = assertVaultUsable(rootInput)

  const existing = findAreaName(root, goal.id)
  const expected = goalAreaName(goal)
  if (existing !== undefined && existing !== expected) {
    throw new VaultError(
      'INVALID_INPUT',
      `目标标题已改，分区目录还是旧名「${existing}」。` +
        `先跑一次迁移（npm run migrate）把它改成「${expected}」，不要新旧并存。`,
    )
  }

  const relativePath = goalAreaRelativePath(goal)
  const base = resolveInsideVault(root, relativePath)
  const created: string[] = []

  if (!existsSync(base)) {
    mkdirSync(base, { recursive: true })
    created.push(relativePath)
  }
  for (const subdir of AREA_SUBDIRS) {
    const absolute = join(base, subdir)
    if (!existsSync(absolute)) {
      mkdirSync(absolute, { recursive: true })
      created.push(join(relativePath, subdir))
    }
  }

  return { relativePath, created }
}

/** 库里所有分区目录名（已排序，便于确定性遍历） */
export function listAreaNames(rootInput: string): string[] {
  const root = assertVaultUsable(rootInput)
  const dir = resolveInsideVault(root, AREAS_DIR)
  if (!existsSync(dir)) return []

  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

/** 按目标 id 找它已有的分区目录名（目录名以 `{id} ` 开头） */
export function findAreaName(root: string, goalId: string): string | undefined {
  return listAreaNames(root).find((name) => name.startsWith(`${goalId} `))
}

/** 某个目标某个子目录下的全部文档 */
export function listAreaDocuments(
  root: string,
  goal: GoalRef,
  subdir: AreaSubdir,
): DocumentSummary[] {
  return listDocuments(root, areaSubdirRelativePath(goal, subdir))
}

/** 全库范围内某个子目录的文档（跨所有目标分区），用于"列出全部"的场景 */
export function listAllAreaDocuments(rootInput: string, subdir: AreaSubdir): DocumentSummary[] {
  const root = assertVaultUsable(rootInput)
  const out: DocumentSummary[] = []
  for (const name of listAreaNames(root)) {
    out.push(...listDocuments(root, join(AREAS_DIR, name, subdir)))
  }
  return out
}

/**
 * 读某个文件时判断它算不算**合法实体**：本项目的 frontmatter 所有权条款要求
 * "`id`/`type` 缺失或非法时该文件被隔离并报告，不参与索引"。
 * 生成器与索引都走这里，避免把用户随手放的笔记变成幽灵卡。
 */
export function isEntityDocument(doc: DocumentSummary, expectedType: string): boolean {
  const id = doc.data['id']
  const type = doc.data['type']
  return typeof id === 'string' && id.trim() !== '' && type === expectedType
}

/** 按 `type` 过滤出合法实体，并返回被跳过的文件（供报告用） */
export function partitionEntities(
  docs: DocumentSummary[],
  expectedType: string,
): { valid: DocumentSummary[]; skipped: DocumentSummary[] } {
  const valid: DocumentSummary[] = []
  const skipped: DocumentSummary[] = []
  for (const doc of docs) {
    if (isEntityDocument(doc, expectedType)) valid.push(doc)
    else skipped.push(doc)
  }
  return { valid, skipped }
}
