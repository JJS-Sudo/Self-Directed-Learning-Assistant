import { requireGoal } from '../domain/goals.js'
import { listAllNodes, listNodes } from '../domain/nodes.js'
import { createResource, listAllResources } from '../domain/resources.js'
import { VaultError } from '../vault/errors.js'
import type { CommitResourceItem } from '../api/resources.js'

export interface PersistResourcesResult {
  created: number
  skipped: { url: string; reason: string }[]
  warnings: string[]
}

/** 落盘资源：全局按 URL 去重；重复的只报告、不落盘 */
export function persistResources(
  root: string,
  goalId: string,
  items: readonly CommitResourceItem[],
): PersistResourcesResult {
  const goal = requireGoal(root, goalId)
  const nodes = new Map(listNodes(root, goal.id).map((node) => [node.id, node]))
  const nodeTitles = new Map(listAllNodes(root).map((node) => [node.id, node.title]))
  const existing = listAllResources(root).filter(
    (resource): resource is typeof resource & { url: string } => resource.url !== undefined,
  )

  const existingUrls = new Set(existing.map((resource) => resource.url))
  const ownerTitle = new Map(
    existing.map((resource) => [
      resource.url,
      resource.nodeId === undefined
        ? '未知节点'
        : (nodeTitles.get(resource.nodeId) ?? resource.nodeId),
    ]),
  )

  const skipped: PersistResourcesResult['skipped'] = []
  let created = 0

  for (const item of items) {
    if (!nodes.has(item.nodeId)) {
      throw new VaultError('INVALID_INPUT', `节点不属于该目标：${item.nodeId}`)
    }

    if (existingUrls.has(item.url)) {
      skipped.push({
        url: item.url,
        reason: `已存在于「${ownerTitle.get(item.url) ?? '未知节点'}」`,
      })
      continue
    }

    createResource({
      root,
      title: item.title,
      node: item.nodeId,
      media: item.media,
      level: item.level,
      url: item.url,
      ...(item.durationMin === undefined ? {} : { durationMin: item.durationMin }),
    })
    created += 1
    existingUrls.add(item.url)
    ownerTitle.set(item.url, nodeTitles.get(item.nodeId) ?? item.nodeId)
  }

  return { created, skipped, warnings: [] }
}
