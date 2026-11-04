import { extractManagedBlock, linkId, wikilink, type Frontmatter } from '../vault/document.js'
import { VaultError } from '../vault/errors.js'
import {
  areaSubdirRelativePath,
  ensureGoalArea,
  listAllAreaDocuments,
  listAreaDocuments,
  partitionEntities,
} from '../vault/goal-areas.js'
import { readDocument, writeDocument, type DocumentSummary } from '../vault/io.js'
import { generateId } from '../vault/ids.js'
import { requireGoal, type GoalSummary } from './goals.js'
import { requireNode } from './nodes.js'
import { requireQuestion } from './questions.js'
import { QUIZ_RESULTS, RECITAL_RESULTS, assertOneOf } from './vocabulary.js'
import { optionalText, requireCalendarDate, requireText, todayLocal } from './validate.js'

/**
 * `Assessment` 验收记录 —— 与题目同放在**目标分区**的 `验收/` 里。
 *
 * 两条硬约束（roadmap P4-2 / P4-3 / P4-4）：
 * - `mode: 做题` 必须带 `question`；`未作答` 也要落一条记录
 * - 同一次验收的两条记录共享 `session_id`
 *
 * 复述正文按 Conventions 写进正文受管区块；历史记录只增不删，因此**没有** `status`。
 */
const ASSESSMENTS_SUBDIR = '验收' as const

export interface AssessmentSummary {
  id: string
  title: string
  sessionId: string
  goalId?: string
  nodeId?: string
  /** 只有 `mode: 做题` 有 */
  questionId?: string
  date: string
  /** 复述 / 做题 */
  mode: string
  /** 复述：已完成 / 未完成；做题：正确 / 错误 / 未作答 */
  result: string
  /** 复述正文（正文受管区块）；做题记录为空 */
  body: string
  relativePath: string
  createdAt: string
}

export interface AssessmentFilter {
  goalId?: string
  nodeId?: string
}

export function newSessionId(): string {
  return `sess-${generateId()}`
}

export interface RecordRecitalInput {
  root: string
  /** 知识网节点 id */
  node: string
  /** 复述正文（长文本，写进受管区块） */
  text: string
  /** 已完成 / 未完成 */
  result: string
  date?: string
  sessionId?: string
  title?: string
}

export function recordRecital(input: RecordRecitalInput): AssessmentSummary {
  const context = resolveContext(input.root, input.node)
  const result = assertOneOf(RECITAL_RESULTS, input.result, 'result')
  const text = requireText(input.text, '复述正文')

  ensureGoalArea(input.root, context.goal)

  const written = writeDocument({
    root: input.root,
    dir: areaSubdirRelativePath(context.goal, ASSESSMENTS_SUBDIR),
    type: 'assessment',
    title: input.title ?? `${context.node.title} · 费曼复述`,
    frontmatter: {
      session_id: resolveSessionId(input.sessionId),
      ...context.link,
      date: resolveDate(input.date),
      mode: '复述',
      result,
    },
    body: text,
  })

  return readAssessmentAt(input.root, written.relativePath)
}

export interface RecordQuizInput {
  root: string
  node: string
  /** 题目 id —— 做题记录必须带 */
  question: string
  /** 正确 / 错误 / 未作答 */
  result: string
  date?: string
  sessionId?: string
  title?: string
}

export function recordQuiz(input: RecordQuizInput): AssessmentSummary {
  const context = resolveContext(input.root, input.node)
  const result = assertOneOf(QUIZ_RESULTS, input.result, 'result')
  const question = requireQuestion(input.root, input.question)

  ensureGoalArea(input.root, context.goal)

  const written = writeDocument({
    root: input.root,
    dir: areaSubdirRelativePath(context.goal, ASSESSMENTS_SUBDIR),
    type: 'assessment',
    title: input.title ?? `${context.node.title} · 做题 · ${question.title}`,
    frontmatter: {
      session_id: resolveSessionId(input.sessionId),
      ...context.link,
      question: wikilink(question.id, question.title),
      date: resolveDate(input.date),
      mode: '做题',
      result,
    },
  })

  return readAssessmentAt(input.root, written.relativePath)
}

export interface RecordSessionInput {
  root: string
  node: string
  date?: string
  recital?: { text: string; result: string }
  quiz?: { question: string; result: string }
}

export interface RecordSessionResult {
  sessionId: string
  assessments: AssessmentSummary[]
}

/** 一次验收：复述与做题共享同一个 `session_id` */
export function recordSession(input: RecordSessionInput): RecordSessionResult {
  if (input.recital === undefined && input.quiz === undefined) {
    throw new VaultError('INVALID_INPUT', '一次验收至少要有一条复述或做题记录')
  }

  const sessionId = newSessionId()
  const date = resolveDate(input.date)
  const assessments: AssessmentSummary[] = []

  if (input.recital !== undefined) {
    assessments.push(
      recordRecital({
        root: input.root,
        node: input.node,
        text: input.recital.text,
        result: input.recital.result,
        date,
        sessionId,
      }),
    )
  }

  if (input.quiz !== undefined) {
    assessments.push(
      recordQuiz({
        root: input.root,
        node: input.node,
        question: input.quiz.question,
        result: input.quiz.result,
        date,
        sessionId,
      }),
    )
  }

  return { sessionId, assessments }
}

export function listAllAssessments(root: string): AssessmentSummary[] {
  return partitionEntities(listAllAreaDocuments(root, ASSESSMENTS_SUBDIR), 'assessment')
    .valid.map((doc) => toAssessmentSummary(doc.relativePath, doc.data, doc.content))
    .sort(compareAssessments)
}

export function listAssessments(root: string, filter: AssessmentFilter = {}): AssessmentSummary[] {
  return listAllAssessments(root).filter(
    (item) =>
      (filter.goalId === undefined || item.goalId === filter.goalId) &&
      (filter.nodeId === undefined || item.nodeId === filter.nodeId),
  )
}

export function listAssessmentsOfGoal(root: string, goal: GoalSummary): AssessmentSummary[] {
  return partitionEntities(listAreaDocuments(root, goal, ASSESSMENTS_SUBDIR), 'assessment')
    .valid.map((doc) => toAssessmentSummary(doc.relativePath, doc.data, doc.content))
    .sort(compareAssessments)
}

/** 同一次验收的记录：按 `session_id` 取，顺序稳定 */
export function listSession(root: string, sessionId: string): AssessmentSummary[] {
  return listAllAssessments(root).filter((item) => item.sessionId === sessionId)
}

export function findAssessment(root: string, id: string): AssessmentSummary | undefined {
  return listAllAssessments(root).find((item) => item.id === id)
}

export function requireAssessment(root: string, id: string): AssessmentSummary {
  const found = findAssessment(root, id)
  if (found === undefined) {
    throw new VaultError('NOT_FOUND', `验收记录不存在：${id}`)
  }
  return found
}

/** 被跳过的非法文件（用户随手放进 `验收/` 的笔记） */
export function listSkippedAssessmentDocs(root: string): DocumentSummary[] {
  return partitionEntities(listAllAreaDocuments(root, ASSESSMENTS_SUBDIR), 'assessment').skipped
}

interface AssessmentContext {
  goal: GoalSummary
  node: ReturnType<typeof requireNode>
  link: Frontmatter
}

/** `goal` 由节点推导（链条推导：Assessment.goal = Goal.id，经 node 承接） */
function resolveContext(root: string, nodeId: string): AssessmentContext {
  const node = requireNode(root, nodeId)
  const link: Frontmatter = { node: wikilink(node.id, node.title) }

  if (node.goalId === undefined) {
    throw new VaultError('INVALID_INPUT', `节点没有所属目标，无法归档验收记录：${nodeId}`)
  }

  const goal = requireGoal(root, node.goalId)
  link['goal'] = wikilink(goal.id, goal.title)
  return { goal, node, link }
}

function resolveSessionId(value: string | undefined): string {
  const text = optionalText(value, 'session_id')
  return text ?? newSessionId()
}

function resolveDate(value: string | undefined): string {
  return value === undefined || value.trim() === ''
    ? todayLocal()
    : requireCalendarDate(value, 'date')
}

function compareAssessments(a: AssessmentSummary, b: AssessmentSummary): number {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
}

function readAssessmentAt(root: string, relativePath: string): AssessmentSummary {
  const doc = readDocument(root, relativePath)
  return toAssessmentSummary(doc.relativePath, doc.data, doc.content)
}

function toAssessmentSummary(
  relativePath: string,
  data: Frontmatter,
  content: string,
): AssessmentSummary {
  const goalId = linkId(data['goal'])
  const nodeId = linkId(data['node'])
  const questionId = linkId(data['question'])

  return {
    id: String(data['id'] ?? ''),
    title: String(data['title'] ?? ''),
    sessionId: String(data['session_id'] ?? ''),
    ...(goalId !== undefined ? { goalId } : {}),
    ...(nodeId !== undefined ? { nodeId } : {}),
    ...(questionId !== undefined ? { questionId } : {}),
    date: String(data['date'] ?? ''),
    mode: String(data['mode'] ?? ''),
    result: String(data['result'] ?? ''),
    body: extractManagedBlock(content) ?? '',
    relativePath,
    createdAt: String(data['created_at'] ?? ''),
  }
}
