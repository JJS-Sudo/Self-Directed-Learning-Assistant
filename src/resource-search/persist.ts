import { requireGoal } from '../domain/goals.js'
import { listAllNodes, listNodes } from '../domain/nodes.js'
import {
  attachNodeToResource,
  createResource,
  detachNodeFromResource,
  listAllResources,
  listResources,
  type ResourceSummary,
} from '../domain/resources.js'
import { VaultError } from '../vault/errors.js'

export interface PersistResourceItem {
  nodeId: string
  title: string
  url: string
  level: string
  media: string
  durationMin?: number
  platform?: string
  price?: string
  /** 搜索摘要，仅用于模型判定，不落盘 */
  snippet?: string
  /** 平台搜索页兜底链接 */
  unverified?: boolean
}

export interface PersistResourcesResult {
  created: number
  /** 已存在的资源追加到新节点 */
  linked: number
  skipped: { url: string; reason: string }[]
  warnings: string[]
}

/**
 * 落盘资源：URL 全局唯一。
 * - 新 URL：创建资源；
 * - 已有 URL：把节点追加到该资源（共享），已关联则跳过；
 * - 写入真实资源后，移除该节点上的平台搜索页兜底链接。
 */
export function persistResources(
  root: string,
  goalId: string,
  items: readonly PersistResourceItem[],
): PersistResourcesResult {
  const goal = requireGoal(root, goalId)
  const nodes = new Map(listNodes(root, goal.id).map((node) => [node.id, node]))
  const nodeTitles = new Map(listAllNodes(root).map((node) => [node.id, node.title]))
  const existing = listAllResources(root).filter(
    (resource): resource is typeof resource & { url: string } => resource.url !== undefined,
  )

  const byUrl = new Map<string, ResourceSummary & { url: string }>(
    existing.map((resource) => [resource.url, resource]),
  )
  const skipped: PersistResourcesResult['skipped'] = []
  const verifiedNodes = new Set<string>()
  let created = 0
  let linked = 0

  for (const item of items) {
    if (!nodes.has(item.nodeId)) {
      throw new VaultError('INVALID_INPUT', `节点不属于该目标：${item.nodeId}`)
    }

    const current = byUrl.get(item.url)
    if (current !== undefined) {
      if (current.nodeIds.includes(item.nodeId)) {
        skipped.push({
          url: item.url,
          reason: `已存在于「${nodeTitles.get(item.nodeId) ?? item.nodeId}」`,
        })
      } else if (attachNodeToResource(root, current.id, item.nodeId)) {
        linked += 1
        byUrl.set(item.url, { ...current, nodeIds: [...current.nodeIds, item.nodeId] })
      }
      if (item.unverified !== true) verifiedNodes.add(item.nodeId)
      continue
    }

    const resource = createResource({
      root,
      title: item.title,
      node: item.nodeId,
      media: item.media,
      level: item.level,
      url: item.url,
      ...(item.durationMin === undefined ? {} : { durationMin: item.durationMin }),
      ...(item.platform === undefined ? {} : { platform: item.platform }),
      ...(item.price === undefined ? {} : { price: item.price }),
      ...(item.unverified === true ? { unverified: true } : {}),
    })
    byUrl.set(item.url, { ...resource, url: item.url })
    created += 1
    if (item.unverified !== true) verifiedNodes.add(item.nodeId)
  }

  for (const nodeId of verifiedNodes) {
    for (const unverified of listResources(root, { nodeIds: [nodeId] })) {
      if (unverified.unverified !== true) continue
      detachNodeFromResource(root, unverified.id, nodeId)
    }
  }

  return { created, linked, skipped, warnings: [] }
}
