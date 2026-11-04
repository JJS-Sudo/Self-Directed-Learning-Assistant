/** 验收与复盘的跨端契约 —— 词表与 DTO */
export const QUIZ_ANSWERS = ['正确', '错误', '未作答'] as const
export const RECITAL_ANSWERS = ['已完成', '未完成'] as const
export const MASTERY_OPTIONS = ['未学', '在学', '已掌握'] as const

export interface NodeAccuracyDto {
  nodeId: string
  total: number
  correct: number
  accuracy: number
}

export interface SessionStatsDto {
  total: number
  correct: number
  wrong: number
  unanswered: number
  recitalDone: number
  recitalPending: number
  byNode: NodeAccuracyDto[]
  suggestedMastery: { nodeId: string; mastery: string }[]
}

export interface AssessmentRecordDto {
  id: string
  sessionId: string
  mode: string
  result: string
  nodeId?: string
  questionId?: string
  date: string
}

export interface SubmitSessionDto {
  sessionId: string
  records: AssessmentRecordDto[]
  stats: SessionStatsDto
}

export interface RetrospectiveDto {
  id: string
  assessmentId?: string
  adjustEventIds: string[]
  date: string
  worked: string
  failed: string
  nextAdjustment: string
}
