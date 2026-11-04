/**
 * Obsidian Canvas（JSON Canvas 1.0）构建器 —— **纯文本卡**形态。
 *
 * 为什么是文本卡而不是文件卡：文本卡自带文字、可以整段迁移、不依赖库内文件名，
 * 实体改名或移动都不会断；文件卡绑定具体路径，一旦目标被改名就会显示成断卡。
 * 连线也不带标签 —— 关系种类由卡片配色与图例卡表达。
 *
 * 布局是**确定性**的：列 = 深度，行 = 叶子顺序，父卡居中于子卡。
 * 同样的输入必然得到同样的坐标，于是"两次生成逐字节一致"是结构性保证。
 */

export type CardColor = '1' | '2' | '3' | '4' | '5' | '6'

export interface CanvasNode {
  id: string
  type: 'text'
  text: string
  x: number
  y: number
  width: number
  height: number
  color?: CardColor
}

export interface CanvasEdge {
  id: string
  fromNode: string
  fromSide?: 'top' | 'right' | 'bottom' | 'left'
  toNode: string
  toSide?: 'top' | 'right' | 'bottom' | 'left'
  label?: string
  color?: string
}

export interface Canvas {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

/** 一棵文本卡树：`title` 会渲染成粗体行，`detail` 是普通行 */
export interface MapCard {
  key: string
  title: string
  detail?: string
  color?: CardColor
  children?: MapCard[]
}

export interface LayoutOptions {
  originX?: number
  originY?: number
  colWidth?: number
  rowGap?: number
  width?: number
}

export const CARD_WIDTH = 300

/** 按字符数估算卡高：中文按 1 个字符算，行高 24px */
export function estimateCardHeight(text: string, width = CARD_WIDTH): number {
  const charsPerLine = Math.max(8, Math.floor((width - 28) / 15))
  const lines = text
    .split('\n')
    .reduce((total, line) => total + Math.max(1, Math.ceil([...line].length / charsPerLine)), 0)
  return Math.max(56, Math.min(420, 30 + lines * 24))
}

export function cardText(card: MapCard): string {
  return card.detail === undefined ? `**${card.title}**` : `**${card.title}**\n${card.detail}`
}

export interface BuiltCanvas {
  canvas: Canvas
  /** 卡片 key → canvas 节点 id（便于外部再加连线） */
  cardIds: Map<string, string>
}

/**
 * 把若干棵树摆成 canvas。返回的 canvas 里，连线一律 `父卡 → 子卡`，
 * `fromSide: bottom` / `toSide: top`（自上而下阅读）。
 */
export function buildTreeCanvas(roots: MapCard[], options: LayoutOptions = {}): BuiltCanvas {
  const originX = options.originX ?? 0
  const originY = options.originY ?? 0
  const colWidth = options.colWidth ?? 420
  const rowGap = options.rowGap ?? 48
  const width = options.width ?? CARD_WIDTH

  const nodes: CanvasNode[] = []
  const edges: CanvasEdge[] = []
  const cardIds = new Map<string, string>()

  let seq = 0
  const nextId = (): string => `n${(seq += 1)}`

  // ── 先算坐标：叶子按顺序拿行，父卡居中于子卡 ──
  let rowCursor = 0
  const rows = new Map<string, { top: number; bottom: number; x: number }>()

  const measure = (card: MapCard, depth: number): number => {
    const x = originX + depth * colWidth
    const children = card.children ?? []
    if (children.length === 0) {
      const height = estimateCardHeight(cardText(card), width)
      const top = rowCursor
      rowCursor += height + rowGap
      rows.set(card.key, { top, bottom: top + height, x })
      return (top + (top + height)) / 2
    }

    const centers = children.map((child) => measure(child, depth + 1))
    const center = (Math.min(...centers) + Math.max(...centers)) / 2
    const height = estimateCardHeight(cardText(card), width)
    rows.set(card.key, { top: center - height / 2, bottom: center + height / 2, x })
    return center
  }

  for (const root of roots) measure(root, 0)

  // ── 再落卡与连线（顺序遍历，保证确定性） ──
  const emit = (card: MapCard, parentId?: string): void => {
    const spot = rows.get(card.key)
    if (spot === undefined) return
    const id = nextId()
    cardIds.set(card.key, id)
    const text = cardText(card)

    nodes.push({
      id,
      type: 'text',
      text,
      x: spot.x,
      y: originY + spot.top,
      width,
      height: spot.bottom - spot.top,
      ...(card.color === undefined ? {} : { color: card.color }),
    })

    if (parentId !== undefined) {
      edges.push({
        id: `e${(seq += 1)}`,
        fromNode: parentId,
        fromSide: 'bottom',
        toNode: id,
        toSide: 'top',
      })
    }

    for (const child of card.children ?? []) emit(child, id)
  }

  for (const root of roots) emit(root)

  return { canvas: { nodes, edges }, cardIds }
}

/** 从"扁平列表 + 子关系"生成森林（保持输入顺序） */
export function forestOf<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  parentKeyOf: (item: T) => string | undefined,
  cardOf: (item: T) => MapCard,
): MapCard[] {
  const cards = new Map<string, MapCard>()
  for (const item of items) {
    const card = cardOf(item)
    cards.set(keyOf(item), { ...card, children: [] })
  }

  const roots: MapCard[] = []
  for (const item of items) {
    const card = cards.get(keyOf(item))
    if (card === undefined) continue
    const parentKey = parentKeyOf(item)
    const parent = parentKey === undefined ? undefined : cards.get(parentKey)
    if (parent === undefined) roots.push(card)
    else parent.children?.push(card)
  }
  return roots
}

/** 幂等的落盘：2 空格缩进 + 末尾换行（同一输入必然得到同一份字节） */
export function serializeCanvas(canvas: Canvas): string {
  return `${JSON.stringify(canvas, null, 2)}\n`
}

/** 三类关系边的固定颜色（与卡片的分支预设色分开，避免"关系的颜色"和"实体的颜色"混淆） */
export const RELATION_COLORS = {
  上级: '#44cf6e',
  并列: '#e0de71',
  相关: '#e9973f',
} as const

export type RelationName = keyof typeof RELATION_COLORS

/** 一棵树的叶子数（叶子 = 没有子节点） */
export function leafCount(card: MapCard): number {
  const children = card.children ?? []
  return children.length === 0 ? 1 : children.reduce((total, child) => total + leafCount(child), 0)
}

export interface RadialOptions extends LayoutOptions {
  /** 每深一层往外推多远 */
  radiusStep?: number
}

/**
 * 径向蛛网布局：**锚点在中心**，分支按角度散开、逐层向外蔓延。
 *
 * - 顶层分支按各自的**叶子数**瓜分 360°（叶子多的扇形更大），分支内部继续按叶子数瓜分父扇区
 * - 父节点的角度取扇区中点 —— 因为子节点按叶子数等比分扇区，这与"子角度均值"等价
 * - 半径 = `深度 × radiusStep`，所以**同深度同半径**，一眼看得出层级
 * - 全程确定性计算（无随机数），因此生成结果可逐字节复现
 *
 * 多个根时：单个根放中心（深度 0）；多个根时它们从半径 1 层开始排（否则会重叠在中心）。
 */
export function buildRadialCanvas(roots: MapCard[], options: RadialOptions = {}): BuiltCanvas {
  const radiusStep = options.radiusStep ?? 440
  const width = options.width ?? 260
  const originX = options.originX ?? 0
  const originY = options.originY ?? 0

  const nodes: CanvasNode[] = []
  const edges: CanvasEdge[] = []
  const cardIds = new Map<string, string>()
  const spots = new Map<string, { left: number; top: number }>()

  let seq = 0
  const nextId = (): string => `n${(seq += 1)}`

  const single = roots.length === 1
  const baseDepth = single ? 0 : 1
  const totalLeaves = roots.reduce((total, root) => total + leafCount(root), 0)

  let cursor = -Math.PI / 2 // 从正上方开始，顺时针铺开
  for (const root of roots) {
    const span = (Math.PI * 2 * leafCount(root)) / Math.max(1, totalLeaves)
    placeNode(root, baseDepth, cursor, cursor + span, width, radiusStep, spots)
    cursor += span
  }

  const emit = (card: MapCard, parentId?: string): void => {
    const spot = spots.get(card.key)
    if (spot === undefined) return

    const id = nextId()
    cardIds.set(card.key, id)
    const text = cardText(card)
    const height = estimateCardHeight(text, width)

    nodes.push({
      id,
      type: 'text',
      text,
      x: originX + spot.left,
      y: originY + spot.top,
      width,
      height,
      ...(card.color === undefined ? {} : { color: card.color }),
    })

    if (parentId !== undefined) {
      edges.push({
        id: `e${(seq += 1)}`,
        fromNode: id,
        toNode: parentId,
        label: '上级',
        color: RELATION_COLORS.上级,
      })
    }

    for (const child of card.children ?? []) emit(child, id)
  }
  for (const root of roots) emit(root)

  return { canvas: { nodes, edges }, cardIds }
}

function placeNode(
  card: MapCard,
  depth: number,
  startAngle: number,
  endAngle: number,
  width: number,
  radiusStep: number,
  spots: Map<string, { left: number; top: number }>,
): void {
  const angle = (startAngle + endAngle) / 2
  const radius = depth * radiusStep
  const height = estimateCardHeight(cardText(card), width)

  spots.set(card.key, {
    left: Math.cos(angle) * radius - width / 2,
    top: Math.sin(angle) * radius - height / 2,
  })

  const children = card.children ?? []
  if (children.length === 0) return

  const total = children.reduce((sum, child) => sum + leafCount(child), 0)
  let cursor = startAngle
  for (const child of children) {
    const span = ((endAngle - startAngle) * leafCount(child)) / Math.max(1, total)
    placeNode(child, depth + 1, cursor, cursor + span, width, radiusStep, spots)
    cursor += span
  }
}

export interface GridRow {
  key: string
  /** 从左到右的卡片；缺列就留空（不占位） */
  cells: (MapCard | undefined)[]
  /** 表头行：只摆卡，不连线 */
  header?: boolean
}

export interface GridOptions {
  colWidths?: number[]
  colGap?: number
  rowGap?: number
  originX?: number
  originY?: number
  /** 统一行高：每行与每张卡都用全局最高行的高度，于是**段与段的间距严格相等**（方正的关键） */
  uniformRowHeight?: boolean
}

/**
 * 网格布局：**方正表格**形态。
 *
 * - 每一列有固定 `x`（列宽 + 列距累加），所以同列卡片严格对齐
 * - `uniformRowHeight` 打开时，所有行高取全局最大值 → 段序自上而下、**步长严格一致**
 * - 行内相邻卡片连一条边（阶段 → 检验信号 → 题目），于是"题目卡只有一条入边"
 *   且必然来自本段的检验信号卡
 */
export function buildGridCanvas(rows: GridRow[], options: GridOptions = {}): BuiltCanvas {
  const colWidths = options.colWidths ?? [320, 380, 300]
  const colGap = options.colGap ?? 60
  const rowGap = options.rowGap ?? 70
  const originX = options.originX ?? 0
  const originY = options.originY ?? 0
  const uniform = options.uniformRowHeight ?? false

  const columnX: number[] = []
  let cursorX = 0
  for (let index = 0; index < colWidths.length; index += 1) {
    columnX.push(cursorX)
    cursorX += (colWidths[index] ?? 300) + colGap
  }

  const heightOfRow = (row: GridRow): number =>
    row.cells.reduce((max, card, columnIndex) => {
      if (card === undefined) return max
      const width = colWidths[columnIndex] ?? 300
      return Math.max(max, estimateCardHeight(cardText(card), width))
    }, 56)

  const rowHeight = uniform ? Math.max(...rows.map(heightOfRow), 56) : 0

  const nodes: CanvasNode[] = []
  const edges: CanvasEdge[] = []
  const cardIds = new Map<string, string>()

  let seq = 0
  const nextId = (): string => `n${(seq += 1)}`

  let cursorY = 0
  for (const row of rows) {
    const rowIds: (string | undefined)[] = []
    const rowH = uniform ? rowHeight : heightOfRow(row)

    row.cells.forEach((card, columnIndex) => {
      if (card === undefined) {
        rowIds.push(undefined)
        return
      }
      const width = colWidths[columnIndex] ?? 300
      const text = cardText(card)
      const id = nextId()
      cardIds.set(card.key, id)
      rowIds.push(id)
      nodes.push({
        id,
        type: 'text',
        text,
        x: originX + (columnX[columnIndex] ?? 0),
        y: originY + cursorY,
        width,
        height: uniform ? rowH : estimateCardHeight(text, width),
        ...(card.color === undefined ? {} : { color: card.color }),
      })
    })

    if (row.header !== true) {
      for (let index = 1; index < rowIds.length; index += 1) {
        const from = rowIds[index - 1]
        const to = rowIds[index]
        if (from === undefined || to === undefined) continue
        edges.push({
          id: `e${(seq += 1)}`,
          fromNode: from,
          fromSide: 'right',
          toNode: to,
          toSide: 'left',
        })
      }
    }

    cursorY += rowH + rowGap
  }

  return { canvas: { nodes, edges }, cardIds }
}
