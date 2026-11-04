import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useViewport,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { LinkType, MapGoalDto, MapNodeDto } from '@shared/map'
import { computeForceLayout, type LayoutPoint } from '../lib/force-layout'

interface Props {
  goal: MapGoalDto | null
  nodes: MapNodeDto[]
  layout: LayoutPoint[] | null
  onNodeClick: (id: string) => void
  onEdgeClick: (edge: { from: string; to: string; type: LinkType }) => void
  onLayoutChange: (points: LayoutPoint[]) => void
}

interface KnowledgeData extends Record<string, unknown> {
  label: string
  order: number
  mastery: string
}

interface GoalData extends Record<string, unknown> {
  label: string
  meta: string
}

function KnowledgeNode({ data }: NodeProps) {
  const node = data as KnowledgeData
  return (
    <div className="map-card">
      <span className="map-order">{node.order}</span>
      <span className={`map-dot map-dot-${node.mastery}`} />
      <span className="map-title">{node.label}</span>
    </div>
  )
}

function GoalNode({ data }: NodeProps) {
  const node = data as GoalData
  return (
    <div className="map-goal-card">
      <span className="map-goal-title">{node.label}</span>
      <span className="map-goal-meta">{node.meta}</span>
    </div>
  )
}

const NODE_TYPES = { knowledge: KnowledgeNode, goal: GoalNode }

const EDGE_STYLE: Record<LinkType, CSSProperties> = {
  parent: { stroke: '#b6b0a2', strokeWidth: 0.9 },
  sibling: { stroke: '#cdc7ba', strokeWidth: 0.8, strokeDasharray: '4 4' },
  related: { stroke: '#a7c1b3', strokeWidth: 0.8, strokeDasharray: '2 4' },
}

const EDGE_LABEL: Record<LinkType, string> = {
  parent: '上级',
  sibling: '并列',
  related: '相关',
}

const NODE_SIZE = { w: 172, h: 58 }
const GOAL_SIZE = { w: 220, h: 72 }

/** 线与卡片的交点：从中心朝目标方向，退到卡片边框外 4px */
function boundaryPoint(
  from: { x: number; y: number },
  to: { x: number; y: number },
  size: { w: number; h: number },
): { x: number; y: number } {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (dx === 0 && dy === 0) return from
  const scale = Math.min(
    (size.w / 2 + 4) / Math.abs(dx || 1e-6),
    (size.h / 2 + 4) / Math.abs(dy || 1e-6),
  )
  return { x: from.x + dx * scale, y: from.y + dy * scale }
}

/** 在视口坐标里自绘边：不依赖 React Flow 的 edge 渲染，标签与箭头都可控 */
function EdgeLayer({
  nodes,
  edges,
  onEdgeClick,
}: {
  nodes: Node[]
  edges: Edge[]
  onEdgeClick: (edge: { from: string; to: string; type: LinkType }) => void
}) {
  const viewport = useViewport()
  const byId = new Map(nodes.map((node) => [node.id, node]))

  return (
    <svg
      className="map-edge-layer"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    >
      <defs>
        <marker
          id="map-arrow"
          markerWidth="12"
          markerHeight="12"
          viewBox="-10 -10 20 20"
          orient="auto-start-reverse"
          refX="0"
          refY="0"
          markerUnits="strokeWidth"
        >
          <path d="M -8 -5 L 0 0 L -8 5 z" fill="#8a8778" />
        </marker>
      </defs>
      <g transform={`translate(${viewport.x},${viewport.y}) scale(${viewport.zoom})`}>
        {edges.map((edge) => {
          const source = byId.get(edge.source)
          const target = byId.get(edge.target)
          if (source === undefined || target === undefined) return null
          const sourceSize = source.type === 'goal' ? GOAL_SIZE : NODE_SIZE
          const targetSize = target.type === 'goal' ? GOAL_SIZE : NODE_SIZE
          const sc = {
            x: source.position.x + sourceSize.w / 2,
            y: source.position.y + sourceSize.h / 2,
          }
          const tc = {
            x: target.position.x + targetSize.w / 2,
            y: target.position.y + targetSize.h / 2,
          }
          const a = boundaryPoint(sc, tc, sourceSize)
          const b = boundaryPoint(tc, sc, targetSize)
          const dx = b.x - a.x
          const dy = b.y - a.y
          const distance = Math.hypot(dx, dy) || 1
          // 轻微弧度：避免长直线完全重叠；大距离时几乎成直线
          const bulge = Math.min(24, distance * 0.08)
          const mx = (a.x + b.x) / 2 - (dy / distance) * bulge
          const my = (a.y + b.y) / 2 + (dx / distance) * bulge
          const data = edge.data as { from?: string; to?: string; type?: LinkType } | undefined
          const type = data?.type ?? 'related'
          return (
            <g key={edge.id} className={`map-edge map-edge-${type}`}>
              <path
                d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
                fill="none"
                stroke={EDGE_STYLE[type].stroke}
                strokeWidth={EDGE_STYLE[type].strokeWidth}
                strokeDasharray={EDGE_STYLE[type].strokeDasharray}
                markerEnd={type === 'parent' ? 'url(#map-arrow)' : undefined}
                style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                onClick={(event) => {
                  event.stopPropagation()
                  if (data?.from !== undefined && data.to !== undefined) {
                    onEdgeClick({ from: data.from, to: data.to, type })
                  }
                }}
              />
            </g>
          )
        })}
      </g>
    </svg>
  )
}

export function KnowledgeGraph({
  goal,
  nodes,
  layout,
  onNodeClick,
  onEdgeClick,
  onLayoutChange,
}: Props) {
  const initial = useMemo(() => {
    const points =
      layout === null || layout.length === 0
        ? computeForceLayout(nodes, { goalId: 'goal' })
        : layout
    const byId = new Map(points.map((point) => [point.id, point]))

    const flowNodes: Node[] = []
    if (goal !== null) {
      const deadline =
        goal.deadline === undefined
          ? ''
          : ` · ${goal.deadline}${goal.daysLeft === undefined ? '' : `（剩 ${goal.daysLeft} 天）`}`
      flowNodes.push({
        id: 'goal',
        type: 'goal',
        position: { x: 0, y: 0 },
        draggable: false,
        selectable: false,
        data: { label: goal.title, meta: `目标${deadline}` },
      })
    }

    for (const node of nodes) {
      const point = byId.get(node.id)
      flowNodes.push({
        id: node.id,
        type: 'knowledge',
        position: point === undefined ? { x: 0, y: 0 } : { x: point.x, y: point.y },
        data: { label: node.title, order: node.order, mastery: node.mastery },
      })
    }

    const flowEdges: Edge[] = []
    const seen = new Set<string>()
    for (const node of nodes) {
      const parent = node.links?.find((link) => link.type === 'parent')
      const parentId = parent?.to ?? node.upId
      if (parentId !== undefined) {
        flowEdges.push({
          id: `parent:${node.id}`,
          source: node.id,
          target: parentId,
          label: EDGE_LABEL.parent,
          labelStyle: { fill: '#6f6b62', fontSize: 11 },
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#8a8778' },
          style: EDGE_STYLE.parent,
          data: { from: node.id, to: parentId, type: 'parent' satisfies LinkType },
        })
      }
      for (const link of node.links ?? []) {
        if (link.type === 'parent') continue
        const key = `${link.type}:${[node.id, link.to].sort().join('|')}`
        if (seen.has(key)) continue
        seen.add(key)
        flowEdges.push({
          id: key,
          source: node.id,
          target: link.to,
          label: EDGE_LABEL[link.type],
          labelStyle: { fill: '#6f6b62', fontSize: 11 },
          style: EDGE_STYLE[link.type],
          data: { from: node.id, to: link.to, type: link.type },
        })
      }
    }

    return { flowNodes, flowEdges }
  }, [goal, nodes, layout])

  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState(initial.flowNodes)
  const flowEdges = initial.flowEdges
  const nodesRef = useRef(flowNodes)
  nodesRef.current = flowNodes

  useEffect(() => {
    setFlowNodes(initial.flowNodes)
  }, [initial, setFlowNodes])

  return (
    <ReactFlowProvider>
      <div className="graph map-graph" style={{ position: 'relative' }}>
        <ReactFlow
          nodes={flowNodes}
          onNodesChange={onNodesChange}
          nodeTypes={NODE_TYPES}
          onNodeClick={(_event, node) => {
            if (node.id !== 'goal') onNodeClick(node.id)
          }}
          onEdgeClick={(_event, edge) => {
            const data = edge.data as { from?: string; to?: string; type?: LinkType } | undefined
            if (data?.from !== undefined && data.to !== undefined && data.type !== undefined) {
              onEdgeClick({ from: data.from, to: data.to, type: data.type })
            }
          }}
          onNodeDragStop={(_event, node) => {
            const points = nodesRef.current
              .filter((item) => item.id !== 'goal')
              .map((item) =>
                item.id === node.id
                  ? { id: item.id, x: node.position.x, y: node.position.y }
                  : { id: item.id, x: item.position.x, y: item.position.y },
              )
            onLayoutChange(points)
          }}
          fitView
          minZoom={0.2}
          maxZoom={2}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} color="#e6e3dc" />
          <Controls showInteractive={false} />
        </ReactFlow>
        <EdgeLayer nodes={flowNodes} edges={flowEdges} onEdgeClick={onEdgeClick} />
      </div>
    </ReactFlowProvider>
  )
}
