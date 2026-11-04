import {
  newSessionId,
  recordQuiz,
  recordRecital,
  type AssessmentSummary,
} from '../domain/assessments.js'
import { requireGoal } from '../domain/goals.js'
import { requireNode } from '../domain/nodes.js'
import { requireQuestion } from '../domain/questions.js'
import { summarizeSession, type SessionStats } from './stats.js'
import { VaultError } from '../vault/errors.js'

export interface SubmitSessionInput {
  root: string
  goalId: string
  questionIds: readonly string[]
  answers?: readonly { questionId: string; result: string }[]
  recitals?: readonly { nodeId: string; text: string; result: string }[]
}

export interface SubmitSessionResult {
  sessionId: string
  records: AssessmentSummary[]
  stats: SessionStats
}

/**
 * 一次交卷：`questionIds` 里的每道题都落一条记录；缺答按「未作答」。
 * 复述与做题共享同一个 session_id。
 */
export function submitSession(input: SubmitSessionInput): SubmitSessionResult {
  const goal = requireGoal(input.root, input.goalId)
  if (input.questionIds.length === 0 && (input.recitals ?? []).length === 0) {
    throw new VaultError('INVALID_INPUT', '这次验收没有选题：先选至少一道题，或写一段复述')
  }

  const questionIds = [...new Set(input.questionIds)]
  const questions = new Map(questionIds.map((id) => [id, requireQuestion(input.root, id)]))
  for (const question of questions.values()) {
    if (question.goalId !== undefined && question.goalId !== goal.id) {
      throw new VaultError('INVALID_INPUT', `题目不属于该目标：${question.id}`)
    }
    if (question.nodeId === undefined) {
      throw new VaultError('INVALID_INPUT', `题目没有关联节点，无法记录：${question.id}`)
    }
  }

  const answerMap = new Map(
    (input.answers ?? []).map((answer) => [answer.questionId, answer.result]),
  )
  const sessionId = newSessionId()
  const records: AssessmentSummary[] = []

  for (const id of questionIds) {
    const question = questions.get(id)
    if (question === undefined || question.nodeId === undefined) continue
    records.push(
      recordQuiz({
        root: input.root,
        node: question.nodeId,
        question: id,
        result: answerMap.get(id) ?? '未作答',
        sessionId,
      }),
    )
  }

  for (const recital of input.recitals ?? []) {
    const node = requireNode(input.root, recital.nodeId)
    if (node.goalId !== undefined && node.goalId !== goal.id) {
      throw new VaultError('INVALID_INPUT', `节点不属于该目标：${recital.nodeId}`)
    }
    records.push(
      recordRecital({
        root: input.root,
        node: recital.nodeId,
        text: recital.text,
        result: recital.result,
        sessionId,
      }),
    )
  }

  return { sessionId, records, stats: summarizeSession(records) }
}
