import { renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  extractManagedBlock,
  findWikilinks,
  linkId,
  sanitizeFileName,
  wikilink,
  type Frontmatter,
} from '../vault/document.js'
import { VaultError } from '../vault/errors.js'
import {
  areaSubdirRelativePath,
  ensureGoalArea,
  listAllAreaDocuments,
  listAreaDocuments,
  partitionEntities,
} from '../vault/goal-areas.js'
import { readDocument, updateDocument, writeDocument, type DocumentSummary } from '../vault/io.js'
import { findGoal, requireGoal } from './goals.js'
import { MASTERY_VALUES, assertOneOf } from './vocabulary.js'

/** 知识网节点放在**目标分区**里：`20-学习项目/<目标>/知识网/` */
const NODES_SUBDIR = '知识网' as const

/** 前端展示用中文：parent=上级，sibling=并列，related=相关；下级是 parent 的反向视角 */
export const LINK_TYPES = ['parent', 'sibling', 'related'] as const
export type NodeLinkType = (typeof LINK_TYPES)[number]

export interface NodeLink {
  to: string
  type: NodeLinkType
}

export interface MapNodeSummary {
  id: string
  title: string
  goalId?: string
  upId?: string
  order: number
  mastery: string
  status: string
  /** 相关关系：来自**正文受管区块**里的双链，不是 frontmatter 字段 */
  relatedIds: string[]
  /** 带类型的关系边（frontmatter `links`）；`parent` 与 `upId` 保持一致 */
  links: NodeLink[]
  relativePath: string
  createdAt: string
}

export interface CreateNodeInput {
  root: string
  title: string
  /** 目标 id */
  goal: string
  /** 父节点 id；缺省 = 直接挂在目标下的顶层节点（不写 `up`） */
  up?: string
}

/**
 * 全库节点。**跳过非法文件**（`id`/`type` 缺失，例如用户随手放进 `知识网/` 的笔记）——
 * 本项目的 frontmatter 所有权条款要求它们被隔离、不参与索引；否则会在知识地图上变成幽灵卡。
 */
export function listAllNodes(root: string): MapNodeSummary[] {
  return partitionEntities(listAllAreaDocuments(root, NODES_SUBDIR), 'map-node').valid.map((doc) =>
    toNodeSummary(doc.relativePath, doc.data, doc.content),
  )
}

/** 被跳过的非法文件（供生成器报告"隔离了几个"） */
export function listSkippedNodeDocs(root: string): DocumentSummary[] {
  return partitionEntities(listAllAreaDocuments(root, NODES_SUBDIR), 'map-node').skipped
}

export function listNodes(root: string, goalId: string): MapNodeSummary[] {
  const goal = findGoal(root, goalId)
  if (goal === undefined) return []

  return partitionEntities(listAreaDocuments(root, goal, NODES_SUBDIR), 'map-node')
    .valid.map((doc) => toNodeSummary(doc.relativePath, doc.data, doc.content))
    .filter((node) => node.goalId === undefined || node.goalId === goalId)
}

export function findNode(root: string, id: string): MapNodeSummary | undefined {
  return listAllNodes(root).find((node) => node.id === id)
}

export function requireNode(root: string, id: string): MapNodeSummary {
  const node = findNode(root, id)
  if (node === undefined) {
    throw new VaultError('NOT_FOUND', `节点不存在：${id}`)
  }
  return node
}

export function createNode(input: CreateNodeInput): MapNodeSummary {
  const goal = requireGoal(input.root, input.goal)
  const requestedParent = input.up?.trim()

  const frontmatter: Frontmatter = {
    goal: wikilink(goal.id, goal.title),
    mastery: '未学',
    status: '在用',
  }

  let upId: string | undefined
  if (requestedParent !== undefined && requestedParent !== '') {
    const parent = requireNode(input.root, requestedParent)
    if (parent.goalId !== goal.id) {
      throw new VaultError('INVALID_INPUT', `父节点不属于该目标：${requestedParent}`)
    }
    // 上层：只由子指向父。下级一律推导，绝不落盘。
    frontmatter['up'] = wikilink(parent.id, parent.title)
    upId = parent.id
  }

  frontmatter['order'] = nextOrder(input.root, goal.id, upId)
  ensureGoalArea(input.root, goal)

  const written = writeDocument({
    root: input.root,
    dir: areaSubdirRelativePath(goal, NODES_SUBDIR),
    type: 'map-node',
    title: input.title,
    frontmatter,
  })

  return {
    id: String(written.data['id'] ?? ''),
    title: String(written.data['title'] ?? ''),
    goalId: goal.id,
    ...(upId !== undefined ? { upId } : {}),
    order: toNumber(written.data['order']),
    mastery: String(written.data['mastery'] ?? '未学'),
    status: String(written.data['status'] ?? '在用'),
    relatedIds: [],
    links: upId === undefined ? [] : [{ to: upId, type: 'parent' }],
    relativePath: written.relativePath,
    createdAt: String(written.data['created_at'] ?? ''),
  }
}

/** 同级下一个序号：同一 `up` 下的最大 `order` + 1（顶层节点看同一目标下没有 `up` 的那些） */
export function nextOrder(root: string, goalId: string, upId?: string): number {
  const siblings = listNodes(root, goalId).filter((node) =>
    upId === undefined ? node.upId === undefined : node.upId === upId,
  )
  return siblings.reduce((max, node) => Math.max(max, node.order), 0) + 1
}

export interface AddRelatedResult {
  source: MapNodeSummary
  target: MapNodeSummary
  alreadyPresent: boolean
}

/**
 * 掌握度回写（roadmap P5-4）。**由复盘时人工指定** —— 不从验收结果自动推导：
 * 自动推导需要一套"几次做对才算已掌握"的判定规则，而那是 尚未定的产品决策。
 */
export function updateMastery(root: string, nodeId: string, mastery: string): MapNodeSummary {
  const node = requireNode(root, nodeId)
  const value = assertOneOf(MASTERY_VALUES, mastery, 'mastery')

  updateDocument({ root, relativePath: node.relativePath, frontmatter: { mastery: value } })
  return requireNode(root, nodeId)
}

/**
 * 建立相关关系：链接**只写进源节点的正文受管区块**。
 * Obsidian 的双链本身是双向的，两边都写就违反"同一事实只存一处"。
 */
export function addRelated(root: string, sourceId: string, targetId: string): AddRelatedResult {
  if (sourceId === targetId) {
    throw new VaultError('INVALID_INPUT', '不能把节点关联到它自己')
  }

  const source = requireNode(root, sourceId)
  const target = requireNode(root, targetId)

  if (source.goalId !== target.goalId) {
    throw new VaultError('INVALID_INPUT', '相关关系只能建在同一目标的知识网内')
  }

  if (source.relatedIds.includes(target.id)) {
    return { source, target, alreadyPresent: true }
  }

  const current = readDocument(root, source.relativePath)
  const link = wikilink(target.id, target.title)
  const inner = extractManagedBlock(current.content) ?? ''
  const nextInner = inner === '' ? link : `${inner.trimEnd()}\n${link}`

  updateDocument({ root, relativePath: source.relativePath, body: nextInner })

  return { source: requireNode(root, sourceId), target, alreadyPresent: false }
}

function toNodeSummary(relativePath: string, data: Frontmatter, content: string): MapNodeSummary {
  const goalId = linkId(data['goal'])
  const upId = linkId(data['up'])
  return {
    id: String(data['id'] ?? ''),
    title: String(data['title'] ?? ''),
    ...(goalId !== undefined ? { goalId } : {}),
    ...(upId !== undefined ? { upId } : {}),
    order: toNumber(data['order']),
    mastery: String(data['mastery'] ?? '未学'),
    status: String(data['status'] ?? '在用'),
    relatedIds: relatedIdsOf(content),
    links: linksOf(data, upId),
    relativePath,
    createdAt: String(data['created_at'] ?? ''),
  }
}

function targetIdOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  return linkId(trimmed) ?? trimmed
}

/** 读取 `links`；`parent` 以 `upId` 为准，旧文件没有 links 时由 upId 合成 */
function linksOf(data: Frontmatter, upId: string | undefined): NodeLink[] {
  const out: NodeLink[] = []
  const seen = new Set<string>()
  const raw = data['links']
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item !== 'object' || item === null) continue
      const record = item as Record<string, unknown>
      const to = targetIdOf(record['to'])
      const type = String(record['type'] ?? '') as NodeLinkType
      if (to === undefined || !LINK_TYPES.includes(type)) continue
      if (type === 'parent') continue
      const key = `${type}:${to}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ to, type })
    }
  }
  if (upId !== undefined && upId !== '') out.unshift({ to: upId, type: 'parent' })
  return out
}

function persistLinks(root: string, node: MapNodeSummary, links: NodeLink[]): MapNodeSummary {
  const parent = links.find((link) => link.type === 'parent')
  updateDocument({
    root,
    relativePath: node.relativePath,
    frontmatter: {
      links: links.map((link) => ({ to: link.to, type: link.type })),
      up: parent === undefined ? null : wikilink(parent.to, requireNode(root, parent.to).title),
    },
  })
  return requireNode(root, node.id)
}

/** 建立带类型的关系；parent 唯一且与 upId 同步，sibling/related 双向去重 */
export function addLink(
  root: string,
  fromId: string,
  toId: string,
  type: NodeLinkType,
): MapNodeSummary {
  if (fromId === toId) throw new VaultError('INVALID_INPUT', '不能把节点连到它自己')
  const from = requireNode(root, fromId)
  const to = requireNode(root, toId)
  if (from.goalId !== to.goalId) {
    throw new VaultError('INVALID_INPUT', '关系只能建在同一目标的知识网内')
  }

  if (type === 'parent') {
    if (from.upId !== undefined && from.upId !== toId) {
      throw new VaultError('INVALID_INPUT', '这个节点已经有上级了；跨层联系请用「相关」')
    }
    let cursor: string | undefined = toId
    const seen = new Set<string>()
    while (cursor !== undefined && !seen.has(cursor)) {
      if (cursor === fromId) {
        throw new VaultError('INVALID_INPUT', '不能形成环：目标节点是当前节点的下级')
      }
      seen.add(cursor)
      cursor = requireNode(root, cursor).upId
    }
    const links = from.links.filter((link) => link.type !== 'parent')
    return persistLinks(root, from, [...links, { to: toId, type: 'parent' }])
  }

  if (
    from.links.some((link) => link.to === toId && link.type === type) ||
    to.links.some((link) => link.to === fromId && link.type === type)
  ) {
    return from
  }
  return persistLinks(root, from, [...from.links, { to: toId, type }])
}

export function removeLink(
  root: string,
  fromId: string,
  toId: string,
  type: NodeLinkType,
): MapNodeSummary {
  const from = requireNode(root, fromId)
  const to = requireNode(root, toId)

  persistLinks(
    root,
    from,
    from.links.filter((link) => !(link.to === toId && link.type === type)),
  )
  const targetLinks = to.links.filter((link) => !(link.to === fromId && link.type === type))
  if (targetLinks.length !== to.links.length) persistLinks(root, to, targetLinks)
  return requireNode(root, fromId)
}

export interface UpdateNodeInput {
  root: string
  id: string
  title?: string
  order?: number
  mastery?: string
}

/** 改标题（同步改文件名）、序号、掌握度 */
export function updateNode(input: UpdateNodeInput): MapNodeSummary {
  const node = requireNode(input.root, input.id)
  const frontmatter: Frontmatter = {}

  let nextTitle: string | undefined
  if (input.title !== undefined) {
    const title = input.title.trim()
    if (title === '') throw new VaultError('INVALID_INPUT', '标题不能为空')
    nextTitle = title
    frontmatter['title'] = title
  }
  if (input.order !== undefined) {
    if (!Number.isInteger(input.order) || input.order < 0) {
      throw new VaultError('INVALID_INPUT', 'order 必须是 ≥ 0 的整数')
    }
    frontmatter['order'] = input.order
  }
  if (input.mastery !== undefined) {
    frontmatter['mastery'] = assertOneOf(MASTERY_VALUES, input.mastery, 'mastery')
  }

  updateDocument({ root: input.root, relativePath: node.relativePath, frontmatter })

  if (nextTitle !== undefined && sanitizeFileName(nextTitle) !== node.title) {
    const nextRelative = join(
      dirname(node.relativePath),
      `${node.id} ${sanitizeFileName(nextTitle)}.md`,
    )
    if (nextRelative !== node.relativePath) {
      renameSync(join(input.root, node.relativePath), join(input.root, nextRelative))
    }
  }

  return requireNode(input.root, input.id)
}

function relatedIdsOf(content: string): string[] {
  const inner = extractManagedBlock(content) ?? ''
  const ids: string[] = []
  for (const target of findWikilinks(inner)) {
    const id = target.split(' ')[0]
    if (id !== undefined && id !== '' && !ids.includes(id)) ids.push(id)
  }
  return ids
}

function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
