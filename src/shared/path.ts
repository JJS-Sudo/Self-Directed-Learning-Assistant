/** 路径与题目的跨端契约 —— **只有类型** */
export interface PathQuestionDto {
  id: string
  kind: string
  title?: string
  stem: string
  answer?: string
  nodeId?: string
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
}

export interface PathStageDto {
  id: string
  title: string
  estimate: string
  order: number
  deliverable?: string
  checks: string[]
  nodeIds: string[]
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
