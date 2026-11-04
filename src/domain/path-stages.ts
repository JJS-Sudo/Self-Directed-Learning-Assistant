import { linkId, wikilink, type Frontmatter } from '../vault/document.js'
import { VaultError } from '../vault/errors.js'
import {
  areaSubdirRelativePath,
  ensureGoalArea,
  listAllAreaDocuments,
  listAreaDocuments,
  partitionEntities,
} from '../vault/goal-areas.js'
import { writeDocument, type DocumentSummary } from '../vault/io.js'
import { requireGoal } from './goals.js'
import { requireNode } from './nodes.js'
import { requireQuestion } from './questions.js'
import {
  lenientTextArray,
  optionalText,
  requireCalendarDate,
  requireIdList,
  requireText,
  requireTextList,
} from './validate.js'

/**
 * `PathStage` 学习路径的一段 —— **取代旧的 `PathEvent`**。
 *
 * 与旧实体的区别（这次改造的关键）：
 * - 时间指导从"日历日期 + 分钟"改成**阶段估时文本**（`约 2–3 天` 这一档）；`date` 降为可选
 * - `nodes` 是本段涉及的知识节点（**数组**）—— 这是"学习路径与知识地图相互对照"的锚
 * - `checks` 是**检验信号**：每条都要可判定，写不出来就是这一段没定义好
 * - `questions` 是跟在本段**后面**的验收题目
 */
const STAGES_SUBDIR = '学习路径' as const

export interface PathStageSummary {
  id: string
  title: string
  goalId?: string
  /** 本段涉及的知识节点 id（数组） */
  nodeIds: string[]
  /** 阶段估时，如 `约 0.5 天` / `约 2–3 天` */
  estimate: string
  /** 产出物（可选） */
  deliverable?: string
  /** 检验信号：每条都必须可判定 */
  checks: string[]
  /** 跟在本段后面的验收题目 id */
  questionIds: string[]
  /** 可选的日历日 */
  date?: string
  order: number
  status: string
  relativePath: string
  createdAt: string
}

export interface CreateStageInput {
  root: string
  goal: string
  title: string
  estimate: string
  /** 涉及的节点 id（至少一个） */
  nodes: string | string[]
  /** 检验信号（至少一条） */
  checks: string | string[]
  /** 跟在本段后面的题目 id（可选） */
  questions?: string | string[]
  deliverable?: string
  date?: string
  order?: number | string
}

/** 检验信号的最小长度：太短的「能讲清」写不清判据 */
export const MIN_CHECK_LENGTH = 6

/** 机器判断不了「可判定」，但能标记常见模糊措辞（只警告，不拦截） */
const VAGUE_CHECK_PREFIX = /^(理解|了解|熟悉|掌握|知道)/

export function assertChecksConcrete(checks: readonly string[]): void {
  for (const check of checks) {
    if (check.length < MIN_CHECK_LENGTH) {
      throw new VaultError(
        'INVALID_INPUT',
        `checks 太短，写不清判据：「${check}」——请写成能观察到的动作（画出来 / 说出来 / 算一遍）`,
      )
    }
  }
}

export function vagueChecks(checks: readonly string[]): string[] {
  return checks.filter((check) => VAGUE_CHECK_PREFIX.test(check.trim()))
}

export function createStage(input: CreateStageInput): PathStageSummary {
  const goal = requireGoal(input.root, input.goal)

  const estimate = requireText(input.estimate, 'estimate')
  const checks = requireTextList(input.checks, 'checks')
  assertChecksConcrete(checks)
  const deliverable = optionalText(input.deliverable, 'deliverable')

  const nodeIds = requireIdList(input.nodes, 'nodes')
  if (nodeIds.length === 0) {
    throw new VaultError('INVALID_INPUT', 'nodes 至少要有一个：本段涉及哪些知识节点')
  }
  for (const nodeId of nodeIds) {
    const node = requireNode(input.root, nodeId)
    if (node.goalId !== undefined && node.goalId !== goal.id) {
      throw new VaultError('INVALID_INPUT', `节点不属于该目标：${nodeId}`)
    }
  }

  const questionIds = requireIdList(input.questions, 'questions')
  for (const questionId of questionIds) {
    const question = requireQuestion(input.root, questionId)
    if (question.goalId !== undefined && question.goalId !== goal.id) {
      throw new VaultError(
        'INVALID_INPUT',
        `题目不属于该目标（跟在本段后面的验收必须是本目标的题）：${questionId}`,
      )
    }
  }

  const rawDate = optionalText(input.date, 'date')
  const date = rawDate === undefined ? undefined : requireCalendarDate(rawDate, 'date')

  const order =
    input.order === undefined || input.order === ''
      ? nextStageOrder(input.root, goal.id)
      : requireOrder(input.order)

  const frontmatter: Frontmatter = {
    goal: wikilink(goal.id, goal.title),
    nodes: nodeIds.map((id) => {
      const node = requireNode(input.root, id)
      return wikilink(node.id, node.title)
    }),
    estimate,
    checks,
    order,
    status: '在用',
  }
  if (deliverable !== undefined) frontmatter['deliverable'] = deliverable
  if (questionIds.length > 0) {
    frontmatter['questions'] = questionIds.map((id) => {
      const question = requireQuestion(input.root, id)
      return wikilink(question.id, question.title)
    })
  }
  if (date !== undefined) frontmatter['date'] = date

  ensureGoalArea(input.root, goal)

  const written = writeDocument({
    root: input.root,
    dir: areaSubdirRelativePath(goal, STAGES_SUBDIR),
    type: 'path-stage',
    title: input.title,
    frontmatter,
  })

  return toStageSummary(written.relativePath, written.data)
}

export function listAllStages(root: string): PathStageSummary[] {
  return partitionEntities(listAllAreaDocuments(root, STAGES_SUBDIR), 'path-stage')
    .valid.map((doc) => toStageSummary(doc.relativePath, doc.data))
    .sort(compareStages)
}

export function listStages(root: string, goalId: string): PathStageSummary[] {
  const goal = requireGoal(root, goalId)
  return partitionEntities(listAreaDocuments(root, goal, STAGES_SUBDIR), 'path-stage')
    .valid.map((doc) => toStageSummary(doc.relativePath, doc.data))
    .sort(compareStages)
}

export function findStage(root: string, id: string): PathStageSummary | undefined {
  return listAllStages(root).find((stage) => stage.id === id)
}

export function requireStage(root: string, id: string): PathStageSummary {
  const stage = findStage(root, id)
  if (stage === undefined) {
    throw new VaultError('NOT_FOUND', `学习路径段不存在：${id}`)
  }
  return stage
}

export function nextStageOrder(root: string, goalId: string): number {
  return listStages(root, goalId).reduce((max, stage) => Math.max(max, stage.order), 0) + 1
}

/** 这一段覆盖哪些知识节点（"路径段 → 节点"） */
export function nodesOfStage(stage: PathStageSummary): string[] {
  return [...stage.nodeIds]
}

/** 某个知识节点被哪几段覆盖（"节点 → 路径段"）。与 `nodesOfStage` 互为逆运算。 */
export function stagesOfNode(root: string, goalId: string, nodeId: string): PathStageSummary[] {
  return listStages(root, goalId).filter((stage) => stage.nodeIds.includes(nodeId))
}

/** 被跳过的非法文件（用户随手放进 `学习路径/` 的笔记） */
export function listSkippedStageDocs(root: string): DocumentSummary[] {
  return partitionEntities(listAllAreaDocuments(root, STAGES_SUBDIR), 'path-stage').skipped
}

function requireOrder(value: number | string): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new VaultError('INVALID_INPUT', 'order 必须是正整数')
  }
  return parsed
}

function compareStages(a: PathStageSummary, b: PathStageSummary): number {
  return a.order - b.order || a.id.localeCompare(b.id)
}

function toStageSummary(relativePath: string, data: Frontmatter): PathStageSummary {
  const goalId = linkId(data['goal'])
  const rawDate = data['date']
  const deliverable = optionalText(data['deliverable'], 'deliverable')

  return {
    id: String(data['id'] ?? ''),
    title: String(data['title'] ?? ''),
    ...(goalId !== undefined ? { goalId } : {}),
    nodeIds: linkIdsOf(data['nodes']),
    estimate: String(data['estimate'] ?? ''),
    ...(deliverable !== undefined ? { deliverable } : {}),
    checks: lenientTextArray(data['checks']),
    questionIds: linkIdsOf(data['questions']),
    ...(typeof rawDate === 'string' && rawDate !== '' ? { date: rawDate } : {}),
    order: toNumber(data['order']),
    status: String(data['status'] ?? '在用'),
    relativePath,
    createdAt: String(data['created_at'] ?? ''),
  }
}

function linkIdsOf(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : value === undefined ? [] : [value]
  const out: string[] = []
  for (const item of raw) {
    const id = linkId(item)
    if (id !== undefined && !out.includes(id)) out.push(id)
  }
  return out
}

function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
