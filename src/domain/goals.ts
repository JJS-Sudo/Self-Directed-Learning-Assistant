import type { Frontmatter } from '../vault/document.js'
import { VaultError } from '../vault/errors.js'
import { listDocuments, updateDocument, writeDocument } from '../vault/io.js'
import { GOAL_KINDS, assertOneOf } from './vocabulary.js'
import { optionalText, requireCalendarDate, todayLocal } from './validate.js'

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

  const frontmatter: Frontmatter = { status: '在用', kind }
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
