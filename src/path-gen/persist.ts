import { requireGoal } from '../domain/goals.js'
import { listNodes } from '../domain/nodes.js'
import { createStage, listStages } from '../domain/path-stages.js'
import { createQuestion } from '../domain/questions.js'
import { coverageWarnings } from '../map-gen/persist.js'
import type { GeneratedStage } from './types.js'

export interface PersistPathResult {
  createdStages: number
  createdQuestions: number
  warnings: string[]
}

/**
 * 落盘：**先建题拿 id，再建段引用**（反过来会写出指向不存在题目的段）。
 * 只追加：新段的 order 接在现有最大值之后，旧段不动。
 */
export function persistPath(
  root: string,
  goalId: string,
  stages: readonly GeneratedStage[],
): PersistPathResult {
  const goal = requireGoal(root, goalId)
  const existing = listStages(root, goal.id)
  const startOrder = existing.reduce((max, stage) => Math.max(max, stage.order), 0) + 1

  let createdStages = 0
  let createdQuestions = 0

  stages.forEach((stage, index) => {
    const questionIds = stage.questions.map((question) => {
      const created = createQuestion({
        root,
        goal: goal.id,
        title: question.stem.slice(0, 40),
        kind: question.kind,
        stem: question.stem,
        ...(question.answer === undefined ? {} : { answer: question.answer }),
        ...(question.explanation === undefined ? {} : { explanation: question.explanation }),
        ...(question.nodeId === undefined ? {} : { node: question.nodeId }),
      })
      createdQuestions += 1
      return created.id
    })

    createStage({
      root,
      goal: goal.id,
      title: stage.title,
      estimate: stage.estimate,
      nodes: stage.nodeIds,
      checks: stage.checks,
      questions: questionIds,
      ...(stage.deliverable === undefined ? {} : { deliverable: stage.deliverable }),
      order: startOrder + index,
    })
    createdStages += 1
  })

  return {
    createdStages,
    createdQuestions,
    warnings: coverageWarnings(root, goal, listNodes(root, goal.id)),
  }
}
