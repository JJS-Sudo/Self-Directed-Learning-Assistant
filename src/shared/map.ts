/** 知识地图的跨端契约 —— **只有类型** */
export const LINK_TYPE_LABELS = {
  parent: '上级',
  sibling: '并列',
  related: '相关',
} as const

export type LinkType = keyof typeof LINK_TYPE_LABELS

export interface MapCandidate {
  tempId: string
  title: string
  parentTempId?: string
  why?: string
}

/** 生成候选里的边：引用的是 tempId */
export interface MapCandidateEdge {
  from: string
  to: string
  type: LinkType
}

export interface MapEstimate {
  sections: number
  chunks: number
  inputChars: number
  inputTokens: number
  outputTokens: number
  costCny: number
}

export interface MapNodeDto {
  id: string
  title: string
  upId?: string
  mastery: string
  order: number
  links: { to: string; type: LinkType }[]
}

export interface MapGoalDto {
  id: string
  title: string
  status: string
  deadline?: string
  daysLeft?: number
}

export interface LayoutPositionDto {
  id: string
  x: number
  y: number
}

export interface MapView {
  goal: MapGoalDto
  nodes: MapNodeDto[]
  layout: { positions: LayoutPositionDto[] } | null
  warnings: string[]
}

export interface MapPreview {
  candidates: MapCandidate[]
  edges: MapCandidateEdge[]
  warnings: string[]
  estimate: MapEstimate
}

export interface MapCommitResult {
  created: number
  links: number
  warnings: string[]
}
