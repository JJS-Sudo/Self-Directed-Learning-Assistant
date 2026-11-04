/** 路径与题目的跨端契约 —— **只有类型** */
export interface PathQuestionDto {
  id: string
  kind: string
  title?: string
  stem: string
  answer?: string
  nodeId?: string
}

export interface PathStageNodeDto {
  id: string
  title: string
}

export interface PathStageResourceDto {
  id: string
  title: string
  url?: string
  platform?: string
  price?: string
  durationMin?: number
  level: string
  media: string
  /** 资源挂载的节点；共享资源会在多个节点下重复出现 */
  nodeId?: string
  nodeTitle?: string
  /** 平台搜索页兜底链接 */
  unverified?: boolean
}

export interface PathStageDto {
  id: string
  title: string
  estimate: string
  order: number
  deliverable?: string
  checks: string[]
  nodeIds: string[]
  nodes: PathStageNodeDto[]
  questionIds: string[]
  questions: PathQuestionDto[]
  resources: PathStageResourceDto[]
}

export interface PathViewDto {
  stages: PathStageDto[]
  questions: PathQuestionDto[]
  warnings: string[]
}

export interface GeneratedQuestionDto {
  tempId: string
  kind: '封闭' | '开放'
  stem: string
  answer?: string
  explanation?: string
  nodeId?: string
}

export interface GeneratedStageDto {
  tempId: string
  title: string
  estimate: string
  nodeIds: string[]
  checks: string[]
  deliverable?: string
  questions: GeneratedQuestionDto[]
}

export interface PathPreviewDto {
  stages: GeneratedStageDto[]
  warnings: string[]
  calls: number
}

export interface PathEstimateDto {
  nodes: number
  leaves: number
  stages: number
  estimatedTokens: number
  costCny: number
}
