import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { listGoals, type GoalSummary } from '../domain/goals.js'
import {
  linkId,
  parseDocument,
  serializeDocument,
  wikilink,
  type Frontmatter,
} from '../vault/document.js'
import {
  areaSubdirRelativePath,
  ensureGoalArea,
  goalAreaRelativePath,
} from '../vault/goal-areas.js'
import { listDocuments } from '../vault/io.js'
import { assertVaultUsable, resolveInsideVault } from '../vault/paths.js'

/**
 * 一次性迁移：把旧的**平铺目录**搬进**目标分区**。
 *
 * 旧 → 新：
 * - `20-知识网/`   → `20-学习项目/<目标>/知识网/`
 * - `30-路径/`     → `20-学习项目/<目标>/学习路径/`，并且 **`PathEvent` → `PathStage`**
 * - `50-题目/`     → `20-学习项目/<目标>/验收/`（目标由它挂的 `node` 推导）
 * - `60-验收/`     → `20-学习项目/<目标>/验收/`
 * - `70-复盘/`     → `20-学习项目/<目标>/复盘/`
 * - `40-资源/` 与 `10-目标/` **不搬**（前者要被多个目标复用、后者要能全局列出）；
 *   但目标会被补上 `kind: 常规`（旧文件没有这个键）
 *
 * 铁律：**不丢文件、不产生重复**。归属不明的文件**留在原处并报告**，不猜。
 */

export const LEGACY_DIRS = ['20-知识网', '30-路径', '50-题目', '60-验收', '70-复盘'] as const

const SUBDIR_OF: Record<(typeof LEGACY_DIRS)[number], '知识网' | '学习路径' | '验收' | '复盘'> = {
  '20-知识网': '知识网',
  '30-路径': '学习路径',
  '50-题目': '验收',
  '60-验收': '验收',
  '70-复盘': '复盘',
}

const EXPECTED_TYPE: Record<(typeof LEGACY_DIRS)[number], string> = {
  '20-知识网': 'map-node',
  '30-路径': 'path-event',
  '50-题目': 'question',
  '60-验收': 'assessment',
  '70-复盘': 'retrospective',
}

export const STAGE_CHECK_PLACEHOLDER = '（迁移占位）请补这条路径段的检验信号'

export interface PlannedMove {
  from: string
  to: string
  legacyType: string
  changes: string[]
  /** 路径段的新段序：旧 `order` 是"同日内"的顺序，迁移后必须重排为**全程段序** */
  stageOrder?: number
}

export interface MigrationPlan {
  moves: PlannedMove[]
  /** 归属不明、留在原处的文件 */
  unattributable: { relativePath: string; reason: string }[]
  goals: { id: string; title: string; needsKind: boolean }[]
}

export interface MigrationResult {
  dryRun: boolean
  plan: MigrationPlan
  moved: number
  filesBefore: number
  filesAfter: number
}

/** `duration_min: 60` → `约 60 分钟`；整小时且超过 1 小时时写成小时 */
export function estimateFromMinutes(minutes: number): string {
  if (minutes > 60 && minutes % 60 === 0) return `约 ${minutes / 60} 小时`
  return `约 ${minutes} 分钟`
}

export function planMigration(rootInput: string): MigrationPlan {
  const root = assertVaultUsable(rootInput)
  const goals = listGoals(root)
  const goalById = new Map(goals.map((goal) => [goal.id, goal]))

  // 旧知识网 → 节点 id 到目标的映射（题目要靠它归属）
  const nodeGoal = new Map<string, string>()
  for (const doc of readLegacy(root, '20-知识网')) {
    const id = String(doc.data['id'] ?? '')
    const goalId = linkId(doc.data['goal'])
    if (id !== '' && goalId !== undefined) nodeGoal.set(id, goalId)
  }

  const moves: PlannedMove[] = []
  const unattributable: { relativePath: string; reason: string }[] = []

  // 旧 `order` 只在"同一天内"有意义；`PathStage.order` 是全程段序，
  // 所以按 (date → order → id) 重排一遍，否则路径会变成 1,2,1,2…
  const stageOrder = new Map<string, number>()
  const counters = new Map<string, number>()
  const legacyStages = readLegacy(root, '30-路径')
    .filter((doc) => String(doc.data['type'] ?? '') === 'path-event')
    .sort(
      (a, b) =>
        String(a.data['date'] ?? '').localeCompare(String(b.data['date'] ?? '')) ||
        toNumber(a.data['order']) - toNumber(b.data['order']) ||
        String(a.data['id'] ?? '').localeCompare(String(b.data['id'] ?? '')),
    )
  for (const doc of legacyStages) {
    const goalId = linkId(doc.data['goal'])
    if (goalId === undefined) continue
    const next = (counters.get(goalId) ?? 0) + 1
    counters.set(goalId, next)
    stageOrder.set(doc.relativePath, next)
  }

  for (const dir of LEGACY_DIRS) {
    for (const doc of readLegacy(root, dir)) {
      const expected = EXPECTED_TYPE[dir]
      const type = String(doc.data['type'] ?? '')
      if (type !== expected) {
        unattributable.push({
          relativePath: doc.relativePath,
          reason: `type 是「${type === '' ? '(空)' : type}」，不是该目录应有的「${expected}」，不猜它属于谁`,
        })
        continue
      }

      const goalId = resolveGoalId(doc.data, dir, nodeGoal)
      if (goalId === undefined || !goalById.has(goalId)) {
        unattributable.push({
          relativePath: doc.relativePath,
          reason:
            goalId === undefined
              ? '缺 goal / node 字段，推不出归属目标'
              : `目标 ${goalId} 不在库里`,
        })
        continue
      }

      const goal = goalById.get(goalId) as GoalSummary
      const targetDir = areaSubdirRelativePath(goal, SUBDIR_OF[dir])
      const fileName = doc.relativePath.split(/[\\/]/).pop() ?? ''
      const changes: string[] = []

      if (dir === '30-路径') {
        changes.push('type: path-event → path-stage')
        changes.push('node → nodes（单个链接升级为数组）')
        changes.push('+ estimate（由 duration_min 换算，或写迁移占位）')
        changes.push(`+ checks（补「${STAGE_CHECK_PLACEHOLDER}」）`)
        changes.push('order 重排为全程段序')
      }
      if (dir === '50-题目') changes.push('+ goal（由 node 推导）')

      const reordered = stageOrder.get(doc.relativePath)
      moves.push({
        from: doc.relativePath,
        to: join(targetDir, fileName),
        legacyType: type,
        changes,
        ...(reordered === undefined ? {} : { stageOrder: reordered }),
      })
    }
  }

  return {
    moves,
    unattributable,
    goals: goals.map((goal) => ({
      id: goal.id,
      title: goal.title,
      needsKind: !hasKindKey(root, goal),
    })),
  }
}

export function runMigration(
  rootInput: string,
  options: { dryRun?: boolean } = {},
): MigrationResult {
  const root = assertVaultUsable(rootInput)
  const dryRun = options.dryRun ?? false
  const filesBefore = countMarkdown(root)
  const plan = planMigration(root)

  if (dryRun) {
    return { dryRun, plan, moved: 0, filesBefore, filesAfter: filesBefore }
  }

  // ① 目标补 kind（其余字段一律不动）
  for (const goal of listGoals(root)) {
    if (hasKindKey(root, goal)) continue
    const absolute = resolveInsideVault(root, goal.relativePath)
    const parsed = parseDocument(readFileSync(absolute, 'utf8'))
    const data: Frontmatter = { ...parsed.data, kind: '常规' }
    writeFileSync(absolute, serializeDocument(data, parsed.content), 'utf8')
  }

  // ② 建区 + 逐文件改写后搬走（先写新、再删旧；同卷内 rename 亦可，这里用写删更直观）
  const goalsNow = listGoals(root)
  for (const move of plan.moves) {
    const goal = goalsNow.find((item) => move.to.startsWith(goalAreaRelativePath(item)))
    if (goal === undefined) {
      throw new Error(`迁移计划内部不一致：找不到 ${move.to} 对应的目标`)
    }
    ensureGoalArea(root, goal)

    const fromAbsolute = resolveInsideVault(root, move.from)
    const toAbsolute = resolveInsideVault(root, move.to)
    const parsed = parseDocument(readFileSync(fromAbsolute, 'utf8'))
    const data = convertFrontmatter(move, parsed.data, goal)

    writeFileSync(toAbsolute, serializeDocument(data, parsed.content), 'utf8')
    if (fromAbsolute !== toAbsolute) unlinkSync(fromAbsolute)
  }

  return { dryRun, plan, moved: plan.moves.length, filesBefore, filesAfter: countMarkdown(root) }
}

function convertFrontmatter(move: PlannedMove, data: Frontmatter, goal: GoalSummary): Frontmatter {
  if (move.legacyType === 'question') {
    // 题目在旧结构里没有 goal（要靠 node 推）；搬到分区后必须有，否则它不属于任何目标
    return { ...data, goal: wikilink(goal.id, goal.title) }
  }

  if (move.legacyType !== 'path-event') return data

  const minutes = Number(data['duration_min'])
  const node = data['node']

  return {
    ...data,
    type: 'path-stage',
    nodes: node === undefined ? [] : [node],
    checks: [STAGE_CHECK_PLACEHOLDER],
    order: move.stageOrder ?? data['order'],
    estimate:
      Number.isFinite(minutes) && minutes > 0
        ? estimateFromMinutes(minutes)
        : '（迁移占位）请补阶段估时，例如 约 2–3 天',
  }
}

function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function resolveGoalId(
  data: Frontmatter,
  dir: (typeof LEGACY_DIRS)[number],
  nodeGoal: Map<string, string>,
): string | undefined {
  if (dir === '50-题目') {
    const nodeId = linkId(data['node'])
    return nodeId === undefined ? undefined : nodeGoal.get(nodeId)
  }
  return linkId(data['goal'])
}

function readLegacy(root: string, dir: string) {
  return existsSync(resolveInsideVault(root, dir)) ? listDocuments(root, dir) : []
}

function hasKindKey(root: string, goal: GoalSummary): boolean {
  const parsed = parseDocument(readFileSync(resolveInsideVault(root, goal.relativePath), 'utf8'))
  return typeof parsed.data['kind'] === 'string'
}

function countMarkdown(root: string): number {
  let count = 0
  const walk = (current: string): void => {
    if (!existsSync(current)) return
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      const full = join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && entry.name.endsWith('.md')) count += 1
    }
  }
  walk(root)
  return count
}
