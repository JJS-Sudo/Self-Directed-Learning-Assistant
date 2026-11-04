import { existsSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Frontmatter } from '../vault/document.js'
import { sanitizeFileName, serializeDocument } from '../vault/document.js'
import { VaultError } from '../vault/errors.js'
import { findAreaName } from '../vault/goal-areas.js'
import { AREAS_DIR, resolveInsideVault } from '../vault/paths.js'
import { listDocuments, readDocument, updateDocument, writeDocument } from '../vault/io.js'
import { GOAL_KINDS, GOAL_STATUSES, assertOneOf } from './vocabulary.js'
import { optionalText, requireCalendarDate, requireText, todayLocal } from './validate.js'

export const GOALS_DIR = '10-目标'

export interface GoalSummary {
  id: string
  title: string
  status: string
  /** 激励性（总目标，要求期限）/ 常规 */
  kind: string
  /** `YYYY-MM-DD`；激励性目标必有 */
  deadline?: string
  /** 距 `deadline` 还有几天（本地日）；已逾期为负；无期限则缺省 */
  daysLeft?: number
  successCriteria?: string
  /** 单目标模型费用预算（人民币元）；只用于警告，不阻止生成 */
  budgetCny?: number
  relativePath: string
  createdAt: string
  /** 最近一次修改时间；旧文件回退为 createdAt */
  updatedAt?: string
}

export interface UpdateGoalPatch {
  title?: string
  successCriteria?: string | null
  kind?: string
  deadline?: string | null
  status?: string
}

export interface CreateGoalInput {
  root: string
  title: string
  successCriteria?: string
  /** 缺省 = 常规 */
  kind?: string
  /** 激励性目标必填 */
  deadline?: string
  /** 注入"今天"（测试用）；缺省取本机本地日 */
  today?: string
}

export interface ListGoalOptions {
  today?: string
}

export function createGoal(input: CreateGoalInput): GoalSummary {
  const rawKind = optionalText(input.kind, 'kind')
  const kind = rawKind === undefined ? '常规' : assertOneOf(GOAL_KINDS, rawKind, 'kind')

  const rawDeadline = optionalText(input.deadline, 'deadline')
  const deadline =
    rawDeadline === undefined ? undefined : requireCalendarDate(rawDeadline, 'deadline')

  if (kind === '激励性' && deadline === undefined) {
    throw new VaultError(
      'INVALID_INPUT',
      '激励性目标必须给期限（deadline）—— 没有期限就不是激励性目标。要建无期限的目标，请把类型选成「常规」。',
    )
  }

  const frontmatter: Frontmatter = { status: '在用', kind, updated_at: new Date().toISOString() }
  const criteria = input.successCriteria?.trim()
  if (criteria !== undefined && criteria !== '') {
    frontmatter['success_criteria'] = criteria
  }
  if (deadline !== undefined) frontmatter['deadline'] = deadline

  const written = writeDocument({
    root: input.root,
    dir: GOALS_DIR,
    type: 'goal',
    title: input.title,
    frontmatter,
  })

  return toGoalSummary(written.relativePath, written.data, resolveToday(input.today))
}

export function listGoals(root: string, options: ListGoalOptions = {}): GoalSummary[] {
  const today = resolveToday(options.today)
  return listDocuments(root, GOALS_DIR)
    .map((doc) => toGoalSummary(doc.relativePath, doc.data, today))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

export function findGoal(
  root: string,
  id: string,
  options: ListGoalOptions = {},
): GoalSummary | undefined {
  return listGoals(root, options).find((goal) => goal.id === id)
}

export function requireGoal(root: string, id: string, options: ListGoalOptions = {}): GoalSummary {
  const goal = findGoal(root, id, options)
  if (goal === undefined) {
    throw new VaultError('NOT_FOUND', `目标不存在：${id}`)
  }
  return goal
}

/** 距期限还有几天（本地日）。逾期为负，当天为 0。 */
export function daysLeftOf(deadline: string, today: string): number {
  const target = Date.UTC(
    Number(deadline.slice(0, 4)),
    Number(deadline.slice(5, 7)) - 1,
    Number(deadline.slice(8, 10)),
  )
  const from = Date.UTC(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)) - 1,
    Number(today.slice(8, 10)),
  )
  return Math.round((target - from) / 86_400_000)
}

function resolveToday(value: string | undefined): string {
  return value === undefined || value.trim() === ''
    ? todayLocal()
    : requireCalendarDate(value, 'today')
}

function toGoalSummary(relativePath: string, data: Frontmatter, today: string): GoalSummary {
  const criteria = data['success_criteria']
  const deadline = typeof data['deadline'] === 'string' ? data['deadline'] : undefined

  const summary: GoalSummary = {
    id: String(data['id'] ?? ''),
    title: String(data['title'] ?? ''),
    status: String(data['status'] ?? '在用'),
    // 旧文件没有 kind/deadline：读取时取默认值、不报错（本项目"演进而非无迁移"）
    kind: typeof data['kind'] === 'string' && data['kind'] !== '' ? data['kind'] : '常规',
    relativePath,
    createdAt: String(data['created_at'] ?? ''),
    updatedAt: String(data['updated_at'] ?? data['created_at'] ?? ''),
  }
  if (deadline !== undefined && deadline !== '') {
    summary.deadline = deadline
    summary.daysLeft = daysLeftOf(deadline, today)
  }
  if (typeof criteria === 'string' && criteria !== '') {
    summary.successCriteria = criteria
  }
  const budget = data['budget_cny']
  if (typeof budget === 'number' && Number.isFinite(budget) && budget >= 0) {
    summary.budgetCny = budget
  }
  return summary
}

/** 设置/清除单目标预算；只写 frontmatter，不阻止任何生成 */
export function setGoalBudget(root: string, id: string, budgetCny: number | null): GoalSummary {
  if (budgetCny !== null && (!Number.isFinite(budgetCny) || budgetCny < 0)) {
    throw new VaultError('INVALID_INPUT', '预算必须是 ≥ 0 的数字（人民币元）')
  }
  const goal = requireGoal(root, id)
  updateDocument({
    root,
    relativePath: goal.relativePath,
    frontmatter: { budget_cny: budgetCny === null ? null : budgetCny },
  })
  return requireGoal(root, id)
}

/**
 * 修改目标。改标题时同时改目标文件与学习项目分区目录，id 不变。
 * 返回更新后的目标；任何一步失败都抛出 VaultError。
 */
export function updateGoal(root: string, id: string, patch: UpdateGoalPatch): GoalSummary {
  const goal = requireGoal(root, id)
  const touched = Object.values(patch).some((value) => value !== undefined)
  if (!touched) throw new VaultError('INVALID_INPUT', '至少修改一个字段')

  const title = patch.title === undefined ? goal.title : requireText(patch.title, 'title')
  if (title.length > 200) throw new VaultError('INVALID_INPUT', '标题最长 200 字')
  const kind = patch.kind === undefined ? goal.kind : assertOneOf(GOAL_KINDS, patch.kind, 'kind')

  let deadline = goal.deadline
  if (patch.deadline !== undefined) {
    deadline =
      patch.deadline === null || patch.deadline.trim() === ''
        ? undefined
        : requireCalendarDate(patch.deadline, 'deadline')
  }
  if (kind === '激励性' && deadline === undefined) {
    throw new VaultError('INVALID_INPUT', '激励性目标必须有期限（deadline）')
  }

  let successCriteria = goal.successCriteria
  if (patch.successCriteria !== undefined) {
    const value = patch.successCriteria === null ? '' : patch.successCriteria.trim()
    if (value.length > 500) throw new VaultError('INVALID_INPUT', '成功判据最长 500 字')
    successCriteria = value === '' ? undefined : value
  }

  const status =
    patch.status === undefined ? goal.status : assertOneOf(GOAL_STATUSES, patch.status, 'status')

  const relativePath = renameGoalStorage(root, goal, title)
  const doc = readDocument(root, relativePath)
  const data: Frontmatter = {
    ...doc.data,
    title,
    kind,
    status,
    updated_at: new Date().toISOString(),
  }
  if (successCriteria === undefined) delete data['success_criteria']
  else data['success_criteria'] = successCriteria
  if (deadline === undefined) delete data['deadline']
  else data['deadline'] = deadline

  writeFileSync(
    resolveInsideVault(root, relativePath),
    serializeDocument(data, doc.content),
    'utf8',
  )
  return requireGoal(root, id)
}

/** 目标文件与分区目录一起改名；冲突在移动前拒绝，第二步失败会回滚第一步 */
function renameGoalStorage(root: string, goal: GoalSummary, nextTitle: string): string {
  if (nextTitle === goal.title) return goal.relativePath

  const safe = sanitizeFileName(nextTitle)
  const nextRelativePath = join(GOALS_DIR, `${goal.id} ${safe}.md`)
  const nextGoalAbs = join(root, nextRelativePath)
  const oldGoalAbs = join(root, goal.relativePath)

  const oldAreaName = findAreaName(root, goal.id)
  const nextAreaName = `${goal.id} ${safe}`
  const nextAreaAbs = join(root, AREAS_DIR, nextAreaName)
  const oldAreaAbs = oldAreaName === undefined ? undefined : join(root, AREAS_DIR, oldAreaName)

  if (nextRelativePath !== goal.relativePath && existsSync(nextGoalAbs)) {
    throw new VaultError('CONFLICT', `目标文件已存在：${nextRelativePath}`)
  }
  if (oldAreaAbs !== undefined && nextAreaName !== oldAreaName && existsSync(nextAreaAbs)) {
    throw new VaultError('CONFLICT', `目标分区已存在：${nextAreaName}`)
  }

  const movedGoal = nextRelativePath !== goal.relativePath
  if (movedGoal) renameSync(oldGoalAbs, nextGoalAbs)

  if (oldAreaAbs !== undefined && nextAreaName !== oldAreaName) {
    try {
      renameSync(oldAreaAbs, nextAreaAbs)
    } catch (error) {
      if (movedGoal) renameSync(nextGoalAbs, oldGoalAbs)
      throw error
    }
  }

  return nextRelativePath
}
