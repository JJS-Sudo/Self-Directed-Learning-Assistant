import type { MapNodeSummary } from '../domain/nodes.js'
import { readPrices } from '../map-gen/estimate.js'

export interface PathEstimate {
  nodes: number
  leaves: number
  stages: number
  estimatedTokens: number
  costCny: number
}

/** 粗略口径：每个节点 ~30 token、每段 ~180、每道题 ~120；只用于生成前提示 */
export function estimatePath(nodes: readonly MapNodeSummary[]): PathEstimate {
  const parents = new Set(
    nodes.map((node) => node.upId).filter((id): id is string => id !== undefined),
  )
  const leaves = nodes.filter((node) => !parents.has(node.id)).length
  const stages = Math.max(1, Math.ceil(leaves / 2))
  const estimatedTokens = nodes.length * 30 + stages * 180 + stages * 2 * 120
  const prices = readPrices()
  const costCny = (estimatedTokens / 1_000_000) * prices.outputPerMillionCny

  return {
    nodes: nodes.length,
    leaves,
    stages,
    estimatedTokens,
    costCny: Math.round(costCny * 1_000_000) / 1_000_000,
  }
}
