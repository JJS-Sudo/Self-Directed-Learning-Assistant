/** 质量面板的跨端契约 */
export interface QualityWarningDto {
  category: '地图' | '路径' | '资源' | '生成'
  message: string
}

export interface QualityRunDto {
  at: string
  kind: string
  ok: boolean
  promptTokens?: number
  completionTokens?: number
  costCny?: number
  durationMs?: number
  error?: string
}

export interface QualityReportDto {
  warnings: QualityWarningDto[]
  failures: QualityRunDto[]
  runs: QualityRunDto[]
  budget: { budgetCny?: number; spentCny: number; over: boolean }
}

export interface RegenerateCandidateDto {
  title: string
  parentNodeId?: string
  why?: string
}

export interface RegenerateResultDto {
  candidates: RegenerateCandidateDto[]
  usage?: { promptTokens?: number; completionTokens?: number }
  costCny?: number
  warnings: string[]
}

export interface ImportResultDto {
  imported: string[]
  skipped: { path: string; reason: string }[]
  failed: { path: string; reason: string }[]
}
