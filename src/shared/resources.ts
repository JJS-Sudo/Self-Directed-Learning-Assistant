/** 资源检索的跨端契约 —— 只有类型与 UI 词表 */
export const RESOURCE_LEVELS = ['入门', '进阶', '熟练'] as const
export const RESOURCE_MEDIA = ['视频', '文字'] as const

export interface ResourceCandidateDto {
  nodeId: string
  title: string
  url: string
  snippet: string
  level?: string
  media?: string
  durationMin?: number
}

export interface ResourcePreviewDto {
  candidates: ResourceCandidateDto[]
  perNode: { nodeId: string; query: string; found: number }[]
  warnings: string[]
}

export interface ResourceDto {
  id: string
  title: string
  url?: string
  nodeId?: string
  nodeTitle?: string
  level: string
  media: string
  durationMin?: number
  score: number
  rankReason: string
}

export interface ResourceViewDto {
  resources: ResourceDto[]
  profile: { level: string; mediaPreference: string; timeBudget: number }
}
