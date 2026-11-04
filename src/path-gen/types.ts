export interface GeneratedQuestion {
  tempId: string
  kind: '封闭' | '开放'
  stem: string
  answer?: string
  explanation?: string
  nodeId?: string
}

export interface GeneratedStage {
  tempId: string
  title: string
  estimate: string
  nodeIds: string[]
  checks: string[]
  deliverable?: string
  questions: GeneratedQuestion[]
}

export interface GeneratePathResult {
  stages: GeneratedStage[]
  warnings: string[]
  /** 实际调用模型的次数（最多 2：一次生成 + 一次补盖） */
  calls: number
}
