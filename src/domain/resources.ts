import { linkId, wikilink, type Frontmatter } from '../vault/document.js'
import { VaultError } from '../vault/errors.js'
import { listDocuments, updateDocument, writeDocument } from '../vault/io.js'
import { requireNode } from './nodes.js'
import { readProfileOrDefault } from './profile.js'
import { rankResources, rankReasonOf } from './ranking.js'
import { LEVELS, MEDIA_TYPES, assertOneOf } from './vocabulary.js'
import {
  lenientPositiveInt,
  lenientTextArray,
  optionalPositiveInt,
  optionalText,
  optionalTextArray,
  requireText,
} from './validate.js'

/**
 * `Resource` 资源 —— 手工录入的视频 / 文字，挂在知识网节点下。
 * `rank_reason` 是排序的可判定输出（roadmap P3-6），创建时就写入，因此任何时刻都非空。
 */
export const RESOURCES_DIR = '40-资源'

export interface ResourceSummary {
  id: string
  title: string
  nodeId?: string
  /** 视频 / 文字 */
  media: string
  url?: string
  tags: string[]
  /** 入门 / 进阶 / 熟练 */
  level: string
  /** 平台：B站 / 慕课 / YouTube / 文档 / 书 */
  platform?: string
  /** 价格：免费 / 付费 */
  price?: string
  /** 可选：时长（分钟）。缺失时排序的「时长」因子记 0 分并写「时长未知」 */
  durationMin?: number
  rankReason: string
  status: string
  relativePath: string
  createdAt: string
}

export interface ResourceFilter {
  /** 只保留挂在这些节点下的资源；缺省 = 全部 */
  nodeIds?: readonly string[]
}

export interface CreateResourceInput {
  root: string
  title: string
  /** 知识网节点 id */
  node: string
  media: string
  level: string
  url?: string
  tags?: string | string[]
  /** 分钟；接受表单传来的字符串，内部统一校验成正整数 */
  durationMin?: number | string
  platform?: string
  price?: string
}

export interface RankedResource extends ResourceSummary {
  score: number
}

export function createResource(input: CreateResourceInput): ResourceSummary {
  const node = requireNode(input.root, input.node)
  const media = assertOneOf(MEDIA_TYPES, input.media, 'media')
  const level = assertOneOf(LEVELS, input.level, 'level')
  const durationMin = optionalPositiveInt(input.durationMin, 'duration_min')
  const url = optionalText(input.url, 'url')
  const tags = optionalTextArray(input.tags, 'tags')
  const platform = optionalText(input.platform, 'platform')
  const price = optionalText(input.price, 'price')

  const frontmatter: Frontmatter = {
    node: wikilink(node.id, node.title),
    media,
    tags,
    level,
    status: '在用',
  }
  if (url !== undefined) frontmatter['url'] = url
  if (durationMin !== undefined) frontmatter['duration_min'] = durationMin
  if (platform !== undefined) frontmatter['platform'] = platform
  if (price !== undefined) frontmatter['price'] = price

  frontmatter['rank_reason'] = rankReasonOf(readProfileOrDefault(input.root), {
    id: '',
    level,
    media,
    ...(durationMin !== undefined ? { durationMin } : {}),
  })

  const written = writeDocument({
    root: input.root,
    dir: RESOURCES_DIR,
    type: 'resource',
    title: requireText(input.title, 'title'),
    frontmatter,
  })

  return toResourceSummary(written.relativePath, written.data)
}

export function listAllResources(root: string): ResourceSummary[] {
  return listDocuments(root, RESOURCES_DIR)
    .map((doc) => toResourceSummary(doc.relativePath, doc.data))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

export function listResources(root: string, filter: ResourceFilter = {}): ResourceSummary[] {
  const all = listAllResources(root)
  const nodeIds = filter.nodeIds
  if (nodeIds === undefined) return all
  const wanted = new Set(nodeIds)
  return all.filter((resource) => resource.nodeId !== undefined && wanted.has(resource.nodeId))
}

export function findResource(root: string, id: string): ResourceSummary | undefined {
  return listAllResources(root).find((resource) => resource.id === id)
}

export function requireResource(root: string, id: string): ResourceSummary {
  const resource = findResource(root, id)
  if (resource === undefined) {
    throw new VaultError('NOT_FOUND', `资源不存在：${id}`)
  }
  return resource
}

/** 按当前画像排序（只算不写盘）：确定性由纯函数 `rankResources` 保证 */
export function listResourcesRanked(root: string, filter: ResourceFilter = {}): RankedResource[] {
  return rankWithProfile(root, filter).map((entry) => ({
    ...entry.item,
    rankReason: entry.rankReason,
    score: entry.score,
  }))
}

/** 排序并把 `rank_reason` 回写到每个资源文件（画像变了以后重新生成理由） */
export function applyRanking(root: string, filter: ResourceFilter = {}): RankedResource[] {
  const out: RankedResource[] = []
  for (const entry of rankWithProfile(root, filter)) {
    if (entry.item.rankReason !== entry.rankReason) {
      updateDocument({
        root,
        relativePath: entry.item.relativePath,
        frontmatter: { rank_reason: entry.rankReason },
      })
    }
    out.push({ ...entry.item, rankReason: entry.rankReason, score: entry.score })
  }
  return out
}

function rankWithProfile(root: string, filter: ResourceFilter) {
  return rankResources(readProfileOrDefault(root), listResources(root, filter))
}

function toResourceSummary(relativePath: string, data: Frontmatter): ResourceSummary {
  const nodeId = linkId(data['node'])
  const rawUrl = data['url']
  const url = typeof rawUrl === 'string' && rawUrl.trim() !== '' ? rawUrl.trim() : undefined
  const durationMin = lenientPositiveInt(data['duration_min'])
  const platform = optionalText(data['platform'], 'platform')
  const price = optionalText(data['price'], 'price')

  return {
    id: String(data['id'] ?? ''),
    title: String(data['title'] ?? ''),
    ...(nodeId !== undefined ? { nodeId } : {}),
    media: String(data['media'] ?? ''),
    ...(url !== undefined ? { url } : {}),
    tags: lenientTextArray(data['tags']),
    level: String(data['level'] ?? ''),
    ...(durationMin !== undefined ? { durationMin } : {}),
    ...(platform === undefined ? {} : { platform }),
    ...(price === undefined ? {} : { price }),
    rankReason: String(data['rank_reason'] ?? ''),
    status: String(data['status'] ?? '在用'),
    relativePath,
    createdAt: String(data['created_at'] ?? ''),
  }
}
