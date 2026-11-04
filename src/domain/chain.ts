import { listAssessmentsOfGoal, type AssessmentSummary } from './assessments.js'
import { buildMapTree, type MapTreeNode } from './graph.js'
import { requireGoal, type GoalSummary } from './goals.js'
import { listNodes, type MapNodeSummary } from './nodes.js'
import { listStages, type PathStageSummary } from './path-stages.js'
import { listResourcesRanked, type RankedResource } from './resources.js'
import { listRetrospectives, type RetrospectiveSummary } from './retrospectives.js'

/**
 * 完整链条：目标 → 知识网 → 学习路径 → 资源 / 验收 → 复盘。
 *
 * 逐跳都靠字段承接，因此**一次调用**就能取回整条链条；只读目标分区与受管目录，
 * 所以库根下非受管的笔记不会混进来。
 */
export interface GoalChain {
  goal: GoalSummary
  nodes: MapNodeSummary[]
  tree: MapTreeNode[]
  /** 学习路径段，按 `order` → `id` 排序 */
  stages: PathStageSummary[]
  /** 按推荐排序（分数降序 → `created_at` → `id`） */
  resources: RankedResource[]
  /** 按 `created_at` → `id` 排序 */
  assessments: AssessmentSummary[]
  retrospectives: RetrospectiveSummary[]
}

export function loadChain(root: string, goalId: string): GoalChain {
  const goal = requireGoal(root, goalId)
  const raw = listNodes(root, goal.id)
  const tree = buildMapTree(raw)

  // 节点的顺序取**树序**（先父后子，同级按 order）：扁平按 order 排会在
  // "子节点的 order 也是 1"时得不到有意义的顺序（每个 up 分组各自从 1 开始）。
  const byId = new Map(raw.map((node) => [node.id, node]))
  const ordered: MapNodeSummary[] = []
  const walk = (list: MapTreeNode[]): void => {
    for (const item of list) {
      const node = byId.get(item.id)
      if (node !== undefined) ordered.push(node)
      walk(item.children)
    }
  }
  walk(tree)
  for (const node of raw) {
    if (!ordered.includes(node)) ordered.push(node)
  }

  return {
    goal,
    nodes: ordered,
    tree,
    stages: listStages(root, goal.id),
    resources: listResourcesRanked(root, { nodeIds: raw.map((node) => node.id) }),
    assessments: listAssessmentsOfGoal(root, goal),
    retrospectives: listRetrospectives(root, { goalId: goal.id }),
  }
}
