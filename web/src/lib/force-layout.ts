import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'

export interface LayoutPoint {
  id: string
  x: number
  y: number
}

type GraphLinkType = 'parent' | 'sibling' | 'related'

interface LayoutNode {
  id: string
  upId?: string
  links?: { to: string; type: GraphLinkType }[]
}

interface SimNode extends SimulationNodeDatum {
  id: string
  goal?: boolean
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  type: GraphLinkType
}

function hashAngle(id: string): number {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0
  }
  return (hash % 360) * (Math.PI / 180)
}

/**
 * 力导向布局：目标固定在原点，知识点围绕它散开。
 * 同样的输入会得到同样的输出（初始角度由 id 哈希决定，迭代次数固定）。
 */
export function computeForceLayout(
  nodes: readonly LayoutNode[],
  options: { goalId: string; goalTitle?: string },
): LayoutPoint[] {
  const goalNode: SimNode = { id: options.goalId, x: 0, y: 0, fx: 0, fy: 0, goal: true }
  const knowledge: SimNode[] = nodes.map((node) => {
    const angle = hashAngle(node.id)
    const radius = 160 + (node.id.length % 5) * 24
    return { id: node.id, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
  })
  const all = [goalNode, ...knowledge]

  const links: SimLink[] = []
  const seen = new Set<string>()
  for (const node of nodes) {
    const parent = node.links?.find((link) => link.type === 'parent')
    if (parent !== undefined) {
      links.push({ source: node.id, target: parent.to, type: 'parent' })
      continue
    }
    if (node.upId !== undefined) {
      links.push({ source: node.id, target: node.upId, type: 'parent' })
      continue
    }
    // 顶层知识点挂到目标卡上
    links.push({ source: node.id, target: options.goalId, type: 'parent' })
  }
  for (const node of nodes) {
    for (const link of node.links ?? []) {
      if (link.type === 'parent') continue
      const key = `${link.type}:${[node.id, link.to].sort().join('|')}`
      if (seen.has(key)) continue
      seen.add(key)
      links.push({ source: node.id, target: link.to, type: link.type })
    }
  }
  // 去掉指向不存在节点的边，d3 会对未知 id 报错
  const known = new Set(all.map((node) => node.id))
  const safeLinks = links.filter(
    (link) => known.has(String(link.source)) && known.has(String(link.target)),
  )

  const simulation = forceSimulation(all)
    .force(
      'link',
      forceLink<SimNode, SimLink>(safeLinks)
        .id((node) => node.id)
        .distance((link) => (link.type === 'parent' ? 150 : 210))
        .strength((link) => (link.type === 'parent' ? 0.75 : 0.3)),
    )
    .force('charge', forceManyBody().strength(-520))
    .force('collide', forceCollide(74))
    .force('center', forceCenter(0, 0))
    .stop()

  for (let tick = 0; tick < 320; tick += 1) simulation.tick()

  return all.map((node) => ({
    id: node.id,
    x: Math.max(-10_000, Math.min(10_000, Math.round((node.x ?? 0) * 10) / 10)),
    y: Math.max(-10_000, Math.min(10_000, Math.round((node.y ?? 0) * 10) / 10)),
  }))
}
