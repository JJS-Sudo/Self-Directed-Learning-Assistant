import type { GoalSummary } from '../domain/goals.js'
import { requireGoal } from '../domain/goals.js'
import type { MapNodeSummary } from '../domain/nodes.js'
import { addLink, createNode, listNodes } from '../domain/nodes.js'
import { checkCoverage, checkDanglingResources } from '../maps/knowledge-map.js'
import { sanitizeFileName } from '../vault/document.js'
import type { RawCandidate, RawEdge } from './types.js'

export interface PersistResult {
  created: number
  links: number
  warnings: string[]
}

function keyOf(title: string): string {
  return sanitizeFileName(title.trim()).toLowerCase()
}

function uniqueTitle(raw: string, used: Set<string>): string {
  const base = raw.trim()
  let title = base
  let suffix = 2
  while (used.has(keyOf(title))) {
    title = `${base}（${suffix}）`
    suffix += 1
  }
  used.add(keyOf(title))
  return title
}

function brief(items: readonly { title?: string; id?: string; stageTitle?: string }[]): string {
  const shown = items
    .slice(0, 5)
    .map((item) => item.title ?? item.stageTitle ?? item.id ?? '（未命名）')
    .join('、')
  return items.length > 5 ? `${shown} 等 ${items.length} 项` : shown
}

export function coverageWarnings(
  root: string,
  goal: GoalSummary,
  nodes: MapNodeSummary[],
): string[] {
  const warnings: string[] = []
  const coverage = checkCoverage(root, goal, nodes)

  if (coverage.uncoveredLeaves.length > 0) {
    warnings.push(`没有被任何路径段覆盖的叶子节点：${brief(coverage.uncoveredLeaves)}`)
  }
  if (coverage.missingNodes.length > 0) {
    warnings.push(`路径段引用了不存在的节点：${brief(coverage.missingNodes)}`)
  }
  if (coverage.unusedResources.length > 0) {
    warnings.push(`没有任何路径段用到的资源：${brief(coverage.unusedResources)}`)
  }

  const dangling = checkDanglingResources(root)
  if (dangling.length > 0) {
    warnings.push(`资源挂在不存在的节点上：${brief(dangling)}`)
  }

  return warnings
}

/**
 * 把候选写成真实节点。**只追加**：绝不覆盖或删除已有节点；
 * 重名（含与既有节点重名）自动追加「（2）」。
 */
export function persistCandidates(
  root: string,
  goalId: string,
  candidates: readonly RawCandidate[],
  edges: readonly RawEdge[] = [],
): PersistResult {
  const goal = requireGoal(root, goalId)
  const used = new Set(listNodes(root, goalId).map((node) => keyOf(node.title)))

  const resolved = new Map<string, string>()
  const pending = [...candidates]
  let created = 0

  while (pending.length > 0) {
    let progressed = false

    for (let index = 0; index < pending.length; index += 1) {
      const candidate = pending[index]
      if (candidate === undefined) continue
      if (candidate.parentTempId !== undefined && !resolved.has(candidate.parentTempId)) continue

      pending.splice(index, 1)
      index -= 1

      const parentId =
        candidate.parentTempId === undefined ? undefined : resolved.get(candidate.parentTempId)
      const title = uniqueTitle(candidate.title, used)
      const node = createNode({
        root,
        title,
        goal: goal.id,
        ...(parentId === undefined ? {} : { up: parentId }),
      })
      resolved.set(candidate.tempId, node.id)
      created += 1
      progressed = true
    }

    if (!progressed) {
      // 防御：父引用成环或指向不存在时，剩下的全部降为顶层，避免死循环
      for (const candidate of pending.splice(0)) {
        const title = uniqueTitle(candidate.title, used)
        const node = createNode({ root, title, goal: goal.id })
        resolved.set(candidate.tempId, node.id)
        created += 1
      }
    }
  }

  const warnings: string[] = []
  let links = 0
  const byId = new Map(listNodes(root, goalId).map((node) => [node.id, node]))

  for (const edge of edges) {
    const fromId = resolved.get(edge.fromTempId)
    const toId = resolved.get(edge.toTempId)
    if (fromId === undefined || toId === undefined) {
      warnings.push('丢弃引用了未落盘候选的关系边')
      continue
    }
    const from = byId.get(fromId)
    if (from === undefined) continue
    if (edge.type === 'parent' && from.upId === toId) continue
    try {
      addLink(root, fromId, toId, edge.type)
      links += 1
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error))
    }
  }

  return {
    created,
    links,
    warnings: [...warnings, ...coverageWarnings(root, goal, listNodes(root, goalId))],
  }
}
