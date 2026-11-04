import { z } from 'zod'
import type { PathStageSummary } from '../domain/path-stages.js'
import type { QuestionSummary } from '../domain/questions.js'
import type { GeneratedStage } from '../path-gen/types.js'

const questionInputSchema = z.object({
  tempId: z.string().min(1),
  kind: z.enum(['封闭', '开放']),
  stem: z.string().trim().min(1, '题干不能为空'),
  answer: z.string().optional(),
  explanation: z.string().optional(),
  nodeId: z.string().optional(),
})

const stageInputSchema = z.object({
  tempId: z.string().min(1),
  title: z.string().trim().min(1, '段标题不能为空'),
  estimate: z.string().trim().min(1, '估时不能为空'),
  nodeIds: z.array(z.string().min(1)).min(1, '每段至少一个节点'),
  checks: z.array(z.string()).min(1, '每段至少一条检验信号'),
  deliverable: z.string().optional(),
  questions: z.array(questionInputSchema).min(1, '每段至少一道题'),
})

export const pathCommitSchema = z
  .object({ stages: z.array(stageInputSchema).min(1, '至少一段').max(50) })
  .superRefine((value, ctx) => {
    value.stages.forEach((stage, stageIndex) => {
      stage.questions.forEach((question, questionIndex) => {
        if (
          question.kind === '封闭' &&
          (question.answer === undefined || question.explanation === undefined)
        ) {
          ctx.addIssue({
            code: 'custom',
            message: '封闭题必须同时有 answer 与 explanation',
            path: ['stages', stageIndex, 'questions', questionIndex],
          })
        }
      })
    })
  })

export type PathCommitInput = z.infer<typeof pathCommitSchema>

export function toGeneratedStages(input: PathCommitInput): GeneratedStage[] {
  return input.stages.map((stage) => ({
    tempId: stage.tempId,
    title: stage.title,
    estimate: stage.estimate,
    nodeIds: stage.nodeIds,
    checks: stage.checks,
    ...(stage.deliverable === undefined ? {} : { deliverable: stage.deliverable }),
    questions: stage.questions.map((question) => ({
      tempId: question.tempId,
      kind: question.kind,
      stem: question.stem,
      ...(question.answer === undefined ? {} : { answer: question.answer }),
      ...(question.explanation === undefined ? {} : { explanation: question.explanation }),
      ...(question.nodeId === undefined ? {} : { nodeId: question.nodeId }),
    })),
  }))
}

export function toStageDto(stage: PathStageSummary): {
  id: string
  title: string
  estimate: string
  order: number
  deliverable?: string
  checks: string[]
  nodeIds: string[]
  questionIds: string[]
} {
  return {
    id: stage.id,
    title: stage.title,
    estimate: stage.estimate,
    order: stage.order,
    ...(stage.deliverable === undefined ? {} : { deliverable: stage.deliverable }),
    checks: stage.checks,
    nodeIds: stage.nodeIds,
    questionIds: stage.questionIds,
  }
}

export function toQuestionDto(question: QuestionSummary): {
  id: string
  kind: string
  stem: string
  answer?: string
  nodeId?: string
} {
  return {
    id: question.id,
    kind: question.kind,
    stem: question.stem,
    ...(question.answer === undefined ? {} : { answer: question.answer }),
    ...(question.nodeId === undefined ? {} : { nodeId: question.nodeId }),
  }
}
