import type { MapNodeSummary } from './nodes.js'

export interface MapTreeNode {
  id: string
  title: string
  order: number
  mastery: string
  status: string
  /** 相关节点（来自正文双链） */
  related: { id: string; title: string }[]
  /** 下级：由"哪些节点的 `up` 指向本节点"推导出来 */
  children: MapTreeNode[]
}

/** 下级 = `up` 指向 `parentId` 的那些节点，按 `order` 升序 */
export function childrenOf(nodes: MapNodeSummary[], parentId: string): MapNodeSummary[] {
  return nodes.filter((node) => node.upId === parentId).sort(compareNodes)
}

/** 并列 = 同一 `up` 下的兄弟集合（`up` 都是 undefined 时即为同一批顶层节点） */
export function siblingsOf(nodes: MapNodeSummary[], id: string): MapNodeSummary[] {
  const self = nodes.find((node) => node.id === id)
  if (self === undefined) return []
  return nodes.filter((node) => node.upId === self.upId).sort(compareNodes)
}

/** 顶层节点：没有 `up`，或 `up` 指向的节点不在本目标内 */
export function topLevelOf(nodes: MapNodeSummary[]): MapNodeSummary[] {
  const known = new Set(nodes.map((node) => node.id))
  return nodes.filter((node) => node.upId === undefined || !known.has(node.upId)).sort(compareNodes)
}

/**
 * 由 `up` 推导出树。
 * `up` 落空或指向库内不存在的节点时按顶层处理 —— 宽容而非报错，
 * 因为用户在 Obsidian 里手改 frontmatter 是允许的。
 */
export function buildMapTree(nodes: MapNodeSummary[]): MapTreeNode[] {
  const titleOf = new Map(nodes.map((node) => [node.id, node.title]))
  const treeNodes = new Map<string, MapTreeNode>()

  for (const node of nodes) {
    treeNodes.set(node.id, {
      id: node.id,
      title: node.title,
      order: node.order,
      mastery: node.mastery,
      status: node.status,
      related: node.relatedIds.map((id) => ({ id, title: titleOf.get(id) ?? id })),
      children: [],
    })
  }

  const roots: MapTreeNode[] = []
  for (const node of nodes) {
    const self = treeNodes.get(node.id)
    if (self === undefined) continue

    const parent = node.upId === undefined ? undefined : treeNodes.get(node.upId)
    if (parent === undefined) roots.push(self)
    else parent.children.push(self)
  }

  sortTree(roots)
  return roots
}

function sortTree(list: MapTreeNode[]): void {
  list.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
  for (const item of list) sortTree(item.children)
}

function compareNodes(a: MapNodeSummary, b: MapNodeSummary): number {
  return a.order - b.order || a.id.localeCompare(b.id)
}

/**
 * 沿 `up` 链上溯的祖先集合（**含自身**）。
 * 容忍异常数据：`up` 指向不存在的节点时自然截断；出现环时靠已访问集合停下，不会死循环。
 */
export function ancestorIdsOf(nodes: MapNodeSummary[], id: string): Set<string> {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const out = new Set<string>()

  let cursor: string | undefined = id
  while (cursor !== undefined && !out.has(cursor)) {
    out.add(cursor)
    cursor = byId.get(cursor)?.upId
  }
  return out
}

/**
 * 两个节点是否在**同一条根→叶路径**上（互为祖先或后代，含相等）。
 *
 * 用途：把"资源挂在节点上"与"路径段涉及节点"两件已有事实接起来 ——
 * 资源挂在枝干上时，覆盖该枝干下叶子的段也算用得上它。
 * 兄弟、跨枝干都返回 `false`。
 */
export function isComparableByLineage(nodes: MapNodeSummary[], aId: string, bId: string): boolean {
  if (aId === bId) return true
  return ancestorIdsOf(nodes, aId).has(bId) || ancestorIdsOf(nodes, bId).has(aId)
}
