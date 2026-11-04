import type { GoalSummary } from '../domain/goals.js'
import { listGoals } from '../domain/goals.js'
import { listNodes } from '../domain/nodes.js'
import { listStages } from '../domain/path-stages.js'
import { listRetrospectives } from '../domain/retrospectives.js'
import { ensureGoalArea, goalAreaRelativePath } from '../vault/goal-areas.js'
import { assertVaultUsable } from '../vault/paths.js'
import { writeKnowledgeMap } from './knowledge-map.js'
import { writeLearningPath } from './learning-path.js'
import { writeRetrospectiveMap } from './retrospective.js'

/**
 * 生成器总入口：把一个目标（或全库目标）的**派生物**重新算一遍。
 *
 * 每个目标产出六个文件（都在它的分区根下）：
 * `知识地图.md` / `知识地图.canvas` / `学习路径.md` / `学习路径.canvas` / `复盘.md` / `复盘.canvas`。
 * 幂等：同样的实体数据，重跑多少次结果都一样。
 */

export interface GoalMapReport {
  goalId: string
  goalTitle: string
  areaRelativePath: string
  nodes: number
  stages: number
  retrospectives: number
  /** 被隔离的非法文件（没有 id/type，不参与生成） */
  skipped: string[]
  /** 没有任何路径段覆盖的叶子节点（地图拆了却没排进路径） */
  uncoveredLeaves: string[]
  /** 路径段引用、但地图上已不存在的节点 */
  missingNodes: string[]
  /** 挂在本目标知识网里、但没有任何路径段用到的资源 */
  unusedResources: string[]
  artifacts: string[]
}

export function generateGoalMaps(rootInput: string, goal: GoalSummary): GoalMapReport {
  const root = assertVaultUsable(rootInput)
  ensureGoalArea(root, goal)

  const knowledge = writeKnowledgeMap(root, goal)
  const path = writeLearningPath(root, goal)
  const retrospective = writeRetrospectiveMap(root, goal)

  return {
    goalId: goal.id,
    goalTitle: goal.title,
    areaRelativePath: goalAreaRelativePath(goal),
    nodes: listNodes(root, goal.id).length,
    stages: listStages(root, goal.id).length,
    retrospectives: listRetrospectives(root, { goalId: goal.id }).length,
    skipped: knowledge.skipped,
    uncoveredLeaves: knowledge.coverage.uncoveredLeaves.map((item) => `${item.id} ${item.title}`),
    missingNodes: knowledge.coverage.missingNodes.map(
      (item) => `${item.id}（来自「${item.stageTitle}」）`,
    ),
    unusedResources: knowledge.coverage.unusedResources.map((item) => `${item.id} ${item.title}`),
    artifacts: [...knowledge.artifacts, ...path.artifacts, ...retrospective.artifacts].map(
      (artifact) => artifact.relativePath,
    ),
  }
}

export function generateAllMaps(rootInput: string): GoalMapReport[] {
  const root = assertVaultUsable(rootInput)
  return listGoals(root).map((goal) => generateGoalMaps(root, goal))
}
