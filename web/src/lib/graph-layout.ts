export interface GraphNodeLike {
  id: string
  title: string
  upId?: string
}

export interface PositionedNode {
  id: string
  label: string
  position: { x: number; y: number }
}

export interface LayoutEdge {
  id: string
  source: string
  target: string
}

export interface GraphLayout {
  nodes: PositionedNode[]
  edges: LayoutEdge[]
}

const COLUMN_GAP = 240
const ROW_GAP = 120

/**
 * 按「父 → 子」的深度分层：深度决定 y，同级序号决定 x。
 * 对成环或悬空父做防御：深度计算带 visited 集合，绝不递归爆栈。
 */
export function buildLayout(nodes: readonly GraphNodeLike[]): GraphLayout {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const depths = new Map<string, number>()

  const depthOf = (id: string, seen: Set<string>): number => {
    const cached = depths.get(id)
    if (cached !== undefined) return cached

    const node = byId.get(id)
    if (node === undefined || node.upId === undefined || seen.has(id)) {
      depths.set(id, 0)
      return 0
    }

    seen.add(id)
    const parent = byId.get(node.upId)
    const depth = parent === undefined ? 0 : depthOf(parent.id, seen) + 1
    depths.set(id, depth)
    return depth
  }

  const counters = new Map<number, number>()
  const positioned: PositionedNode[] = nodes.map((node) => {
    const depth = depthOf(node.id, new Set())
    const index = counters.get(depth) ?? 0
    counters.set(depth, index + 1)
    return {
      id: node.id,
      label: node.title,
      position: { x: index * COLUMN_GAP, y: depth * ROW_GAP },
    }
  })

  const edges: LayoutEdge[] = nodes
    .filter((node) => node.upId !== undefined)
    .map((node) => ({
      id: `${node.upId}->${node.id}`,
      source: node.upId ?? '',
      target: node.id,
    }))

  return { nodes: positioned, edges }
}
