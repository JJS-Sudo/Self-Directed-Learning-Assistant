import type { AssessmentSummary } from '../domain/assessments.js'

export interface NodeAccuracy {
  nodeId: string
  total: number
  correct: number
  accuracy: number
}

export interface SessionStats {
  total: number
  correct: number
  wrong: number
  unanswered: number
  recitalDone: number
  recitalPending: number
  byNode: NodeAccuracy[]
  suggestedMastery: { nodeId: string; mastery: string }[]
}

/** 正确率分母只含做题（正确 + 错误 + 未作答）；复述单独统计 */
export function summarizeSession(records: readonly AssessmentSummary[]): SessionStats {
  const quiz = records.filter((record) => record.mode === '做题')
  const recital = records.filter((record) => record.mode === '复述')

  const correct = quiz.filter((record) => record.result === '正确').length
  const wrong = quiz.filter((record) => record.result === '错误').length
  const unanswered = quiz.filter((record) => record.result === '未作答').length

  const byNodeMap = new Map<string, { total: number; correct: number }>()
  for (const record of quiz) {
    if (record.nodeId === undefined) continue
    const entry = byNodeMap.get(record.nodeId) ?? { total: 0, correct: 0 }
    entry.total += 1
    if (record.result === '正确') entry.correct += 1
    byNodeMap.set(record.nodeId, entry)
  }

  const byNode: NodeAccuracy[] = [...byNodeMap.entries()].map(([nodeId, entry]) => ({
    nodeId,
    total: entry.total,
    correct: entry.correct,
    accuracy: entry.total === 0 ? 0 : entry.correct / entry.total,
  }))

  return {
    total: quiz.length,
    correct,
    wrong,
    unanswered,
    recitalDone: recital.filter((record) => record.result === '已完成').length,
    recitalPending: recital.filter((record) => record.result === '未完成').length,
    byNode,
    suggestedMastery: byNode.map((entry) => ({
      nodeId: entry.nodeId,
      mastery: suggestOf(entry.accuracy),
    })),
  }
}

/** ≥80% 已掌握；>0 在学；0 未学 */
export function suggestOf(accuracy: number): string {
  if (accuracy >= 0.8) return '已掌握'
  if (accuracy > 0) return '在学'
  return '未学'
}
