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
import { requireGoal } from './goals.js'
import { requireNode } from './nodes.js'
import { QUESTION_KINDS, assertOneOf } from './vocabulary.js'
import { optionalText, requireText } from './validate.js'

/**
 * `Question` 题目 —— 放在**目标分区**的 `验收/` 里。
 * `kind: 封闭` 必须有题干、答案、解析三项；`kind: 开放` 允许缺后两项。
 *
 * 落盘分工（Conventions「长文本写在正文的受管区块里」）：
 * - `kind` / `stem` / `answer` / `node` / `goal` / `status` → frontmatter
 * - **解析全文 `explanation` → 正文受管区块**
 */
const QUESTIONS_SUBDIR = '验收' as const

export interface QuestionSummary {
  id: string
  title: string
  goalId?: string
  /** 封闭 / 开放 */
  kind: string
  stem: string
  answer?: string
  /** 解析全文，来自正文受管区块 */
  explanation?: string
  nodeId?: string
  status: string
  relativePath: string
  createdAt: string
}

export interface CreateQuestionInput {
  root: string
  /** 目标 id —— 题目属于某个目标（决定它落在哪个分区） */
  goal: string
  title: string
  kind: string
  stem: string
  node?: string
  answer?: string
  explanation?: string
}

export function createQuestion(input: CreateQuestionInput): QuestionSummary {
  const goal = requireGoal(input.root, input.goal)
  const kind = assertOneOf(QUESTION_KINDS, input.kind, 'kind')
  const stem = requireText(input.stem, 'stem')
  const answer = optionalText(input.answer, 'answer')
  const explanation = optionalText(input.explanation, 'explanation')
  const nodeId = optionalText(input.node, 'node')

  if (kind === '封闭') {
    if (answer === undefined) {
      throw new VaultError('INVALID_INPUT', '封闭题必须有答案（answer）')
    }
    if (explanation === undefined) {
      throw new VaultError('INVALID_INPUT', '封闭题必须有解析（explanation）')
    }
  }

  const frontmatter: Frontmatter = {
    goal: wikilink(goal.id, goal.title),
    kind,
    stem,
    status: '在用',
  }
  if (answer !== undefined) frontmatter['answer'] = answer

  if (nodeId !== undefined) {
    const node = requireNode(input.root, nodeId)
    if (node.goalId !== undefined && node.goalId !== goal.id) {
      throw new VaultError('INVALID_INPUT', `节点不属于该目标：${nodeId}`)
    }
    frontmatter['node'] = wikilink(node.id, node.title)
  }

  ensureGoalArea(input.root, goal)

  const written = writeDocument({
    root: input.root,
    dir: areaSubdirRelativePath(goal, QUESTIONS_SUBDIR),
    type: 'question',
    title: requireText(input.title, 'title'),
    frontmatter,
    ...(explanation !== undefined ? { body: explanation } : {}),
  })

  return readQuestionAt(input.root, written.relativePath)
}

export function listAllQuestions(root: string): QuestionSummary[] {
  return partitionEntities(listAllAreaDocuments(root, QUESTIONS_SUBDIR), 'question')
    .valid.map((doc) => toQuestionSummary(doc.relativePath, doc.data, doc.content))
    .sort(compareQuestions)
}

export function listQuestions(root: string, goalId: string): QuestionSummary[] {
  const goal = requireGoal(root, goalId)
  return partitionEntities(listAreaDocuments(root, goal, QUESTIONS_SUBDIR), 'question')
    .valid.map((doc) => toQuestionSummary(doc.relativePath, doc.data, doc.content))
    .sort(compareQuestions)
}

/** 某个节点下挂着的题目（验收挂在节点上，路径段再引用它们） */
export function listQuestionsOfNode(
  root: string,
  goalId: string,
  nodeId: string,
): QuestionSummary[] {
  return listQuestions(root, goalId).filter((question) => question.nodeId === nodeId)
}

export function findQuestion(root: string, id: string): QuestionSummary | undefined {
  return listAllQuestions(root).find((question) => question.id === id)
}

export function requireQuestion(root: string, id: string): QuestionSummary {
  const question = findQuestion(root, id)
  if (question === undefined) {
    throw new VaultError('NOT_FOUND', `题目不存在：${id}`)
  }
  return question
}

/** 被跳过的非法文件（用户随手放进 `验收/` 的笔记） */
export function listSkippedQuestionDocs(root: string): DocumentSummary[] {
  return partitionEntities(listAllAreaDocuments(root, QUESTIONS_SUBDIR), 'question').skipped
}

function compareQuestions(a: QuestionSummary, b: QuestionSummary): number {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
}

function readQuestionAt(root: string, relativePath: string): QuestionSummary {
  const doc = readDocument(root, relativePath)
  return toQuestionSummary(doc.relativePath, doc.data, doc.content)
}

function toQuestionSummary(
  relativePath: string,
  data: Frontmatter,
  content: string,
): QuestionSummary {
  const explanation = extractManagedBlock(content)
  const nodeId = linkId(data['node'])
  const goalId = linkId(data['goal'])
  const answer = asText(data['answer'])

  return {
    id: String(data['id'] ?? ''),
    title: String(data['title'] ?? ''),
    ...(goalId !== undefined ? { goalId } : {}),
    kind: String(data['kind'] ?? ''),
    stem: String(data['stem'] ?? ''),
    ...(answer !== undefined ? { answer } : {}),
    ...(explanation !== undefined && explanation !== '' ? { explanation } : {}),
    ...(nodeId !== undefined ? { nodeId } : {}),
    status: String(data['status'] ?? '在用'),
    relativePath,
    createdAt: String(data['created_at'] ?? ''),
  }
}

function asText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}
