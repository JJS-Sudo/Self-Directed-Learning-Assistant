import { isComparableByLineage } from '../domain/graph.js'
import type { GoalSummary } from '../domain/goals.js'
import { listNodes } from '../domain/nodes.js'
import type { PathStageSummary } from '../domain/path-stages.js'
import { readProfileOrDefault } from '../domain/profile.js'
import { rankResources } from '../domain/ranking.js'
import { listAllResources, type RankedResource, type ResourceSummary } from '../domain/resources.js'

/**
 * 「资源 ↔ 学习路径段」的配套关系 —— **推导**，不新增存储。
 *
 * 规则：资源挂的节点（`Resource.node`）与本段涉及的某个节点（`PathStage.nodes`）
 * 在**同一条根→叶路径**上（互为祖先/后代，含相等），就算本段的配套资源。
 *
 * 于是"资源挂在枝干上"也能被下面叶子的段用到，而"资源挂在不相关的枝干上"不会被误配。
 * 段内排序复用三因子推荐排序（与资源跳转站同一个纯函数），所以可解释、确定性。
 *
 * **这一层不读任何资源内容**：它只看节点归属。
 */

/** 某段的配套资源（已按三因子排序） */
export type StageResourceResolver = (stage: PathStageSummary) => RankedResource[]

export interface StageResourceView {
  /** 本目标知识网里的全部资源（按 `node` 归属划分） */
  scoped: ResourceSummary[]
  /** 某段的配套资源 */
  ofStage: StageResourceResolver
}

export function buildStageResources(root: string, goal: GoalSummary): StageResourceView {
  const nodes = listNodes(root, goal.id)
  const nodeIds = new Set(nodes.map((node) => node.id))

  // `40-资源/` 是平铺的：靠 `node` 把资源划到本目标
  const scoped = listAllResources(root).filter(
    (resource) => resource.nodeId !== undefined && nodeIds.has(resource.nodeId),
  )
  const profile = readProfileOrDefault(root)

  const ofStage: StageResourceResolver = (stage) =>
    rankResources(
      profile,
      scoped.filter((resource) =>
        stage.nodeIds.some((stageNodeId) =>
          isComparableByLineage(nodes, resource.nodeId ?? '', stageNodeId),
        ),
      ),
    ).map((entry) => ({ ...entry.item, rankReason: entry.rankReason, score: entry.score }))

  return { scoped, ofStage }
}
