import { linkId, wikilink, type Frontmatter } from '../vault/document.js'
import { VaultError } from '../vault/errors.js'
import {
  areaSubdirRelativePath,
  ensureGoalArea,
  listAllAreaDocuments,
  partitionEntities,
} from '../vault/goal-areas.js'
import { writeDocument, type DocumentSummary } from '../vault/io.js'
import { requireAssessment } from './assessments.js'
import { requireGoal } from './goals.js'
import { updateMastery } from './nodes.js'
import { requireStage } from './path-stages.js'
import {
  optionalText,
  requireCalendarDate,
  requireIdList,
  requireText,
  todayLocal,
} from './validate.js'

/**
 * `Retrospective` 复盘 —— 闭环的回写口，放在**目标分区**的 `复盘/` 里。
 *
 * - 通过 `assessment` 挂回一次验收（`goal` 由该验收推导）
 * - 调整项通过 `adjust_events` 关联回具体**学习路径段**（`PathStage`；
 *   字段名沿用 `adjust_events`，因为"调整了哪一段"才是它要表达的东西，
 *   而旧 `PathEvent` 迁移时会**保留同一个 id**，所以老链接不会断）
 * - `mastery` 由**复盘时人工指定**（不是从验收结果自动推导），写回该验收对应的节点
 */
const RETROSPECTIVES_SUBDIR = '复盘' as const

export interface RetrospectiveSummary {
  id: string
  title: string
  assessmentId?: string
  goalId?: string
  /** 被调整的学习路径段 id */
  adjustEventIds: string[]
  date: string
  worked: string
  failed: string
  nextAdjustment: string
  relativePath: string
  createdAt: string
}

export interface CreateRetrospectiveInput {
  root: string
  /** 被复盘的验收记录 id */
  assessment: string
  worked: string
  failed: string
  nextAdjustment: string
  adjustEvents?: string | string[]
  date?: string
  title?: string
  /** 可选：同时把该验收对应节点的掌握度改成 未学 / 在学 / 已掌握 */
  mastery?: string
}

export interface RetrospectiveFilter {
  goalId?: string
  assessmentId?: string
}

export function createRetrospective(input: CreateRetrospectiveInput): RetrospectiveSummary {
  const assessment = requireAssessment(input.root, input.assessment)
  const worked = requireText(input.worked, 'worked')
  const failed = requireText(input.failed, 'failed')
  const nextAdjustment = requireText(input.nextAdjustment, 'next_adjustment')
  const stageIds = requireIdList(input.adjustEvents, 'adjust_events')

  // 逐个校验存在性：绝不写断链
  const links = stageIds.map((id) => {
    const stage = requireStage(input.root, id)
    return wikilink(stage.id, stage.title)
  })

  if (assessment.goalId === undefined) {
    throw new VaultError(
      'INVALID_INPUT',
      `该验收记录没有所属目标，无法归档复盘：${input.assessment}`,
    )
  }
  const goal = requireGoal(input.root, assessment.goalId)

  // 先改 mastery 再写复盘：校验失败时不留半条记录
  const mastery = optionalText(input.mastery, 'mastery')
  if (mastery !== undefined) {
    if (assessment.nodeId === undefined) {
      throw new VaultError('INVALID_INPUT', '该验收记录没有关联节点，无法回写 mastery')
    }
    updateMastery(input.root, assessment.nodeId, mastery)
  }

  const frontmatter: Frontmatter = {
    assessment: wikilink(assessment.id, assessment.title),
    goal: wikilink(goal.id, goal.title),
    date: resolveDate(input.date),
    worked,
    failed,
    next_adjustment: nextAdjustment,
  }
  if (links.length > 0) frontmatter['adjust_events'] = links

  ensureGoalArea(input.root, goal)

  const written = writeDocument({
    root: input.root,
    dir: areaSubdirRelativePath(goal, RETROSPECTIVES_SUBDIR),
    type: 'retrospective',
    title: input.title ?? `复盘 · ${assessment.title}`,
    frontmatter,
  })

  return toRetrospectiveSummary(written.relativePath, written.data)
}

export function listAllRetrospectives(root: string): RetrospectiveSummary[] {
  return partitionEntities(listAllAreaDocuments(root, RETROSPECTIVES_SUBDIR), 'retrospective')
    .valid.map((doc) => toRetrospectiveSummary(doc.relativePath, doc.data))
    .sort(compareRetrospectives)
}

export function listRetrospectives(
  root: string,
  filter: RetrospectiveFilter = {},
): RetrospectiveSummary[] {
  return listAllRetrospectives(root).filter(
    (item) =>
      (filter.goalId === undefined || item.goalId === filter.goalId) &&
      (filter.assessmentId === undefined || item.assessmentId === filter.assessmentId),
  )
}

/** 被跳过的非法文件（用户随手放进 `复盘/` 的笔记） */
export function listSkippedRetrospectiveDocs(root: string): DocumentSummary[] {
  return partitionEntities(listAllAreaDocuments(root, RETROSPECTIVES_SUBDIR), 'retrospective')
    .skipped
}

function resolveDate(value: string | undefined): string {
  return value === undefined || value.trim() === ''
    ? todayLocal()
    : requireCalendarDate(value, 'date')
}

function compareRetrospectives(a: RetrospectiveSummary, b: RetrospectiveSummary): number {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
}

function toRetrospectiveSummary(relativePath: string, data: Frontmatter): RetrospectiveSummary {
  const assessmentId = linkId(data['assessment'])
  const goalId = linkId(data['goal'])
  const adjustEvents = data['adjust_events']

  return {
    id: String(data['id'] ?? ''),
    title: String(data['title'] ?? ''),
    ...(assessmentId !== undefined ? { assessmentId } : {}),
    ...(goalId !== undefined ? { goalId } : {}),
    adjustEventIds: linkIdsOf(adjustEvents),
    date: String(data['date'] ?? ''),
    worked: String(data['worked'] ?? ''),
    failed: String(data['failed'] ?? ''),
    nextAdjustment: String(data['next_adjustment'] ?? ''),
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
