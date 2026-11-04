import { z } from 'zod'
import type { AssessmentSummary } from '../domain/assessments.js'
import type { RetrospectiveSummary } from '../domain/retrospectives.js'
import { QUIZ_RESULTS, RECITAL_RESULTS, MASTERY_VALUES } from '../domain/vocabulary.js'

export const submitSessionSchema = z.object({
  questionIds: z.array(z.string().min(1)).min(1, '至少选一道题').max(20, '一次最多 20 道题'),
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1),
        result: z.enum(QUIZ_RESULTS),
      }),
    )
    .max(20)
    .optional(),
  recitals: z
    .array(
      z.object({
        nodeId: z.string().min(1),
        text: z.string().trim().min(1, '复述正文不能为空'),
        result: z.enum(RECITAL_RESULTS),
      }),
    )
    .max(10)
    .optional(),
})

export const createRetrospectiveSchema = z.object({
  assessmentId: z.string().min(1),
  worked: z.string().trim().min(1, 'worked 不能为空'),
  failed: z.string().trim().min(1, 'failed 不能为空'),
  nextAdjustment: z.string().trim().min(1, 'next_adjustment 不能为空'),
  stageIds: z.array(z.string().min(1)).max(50).optional(),
  mastery: z.enum(MASTERY_VALUES).optional(),
})

export type SubmitSessionInput = z.infer<typeof submitSessionSchema>
export type CreateRetrospectiveInput = z.infer<typeof createRetrospectiveSchema>

export function toAssessmentDto(record: AssessmentSummary): {
  id: string
  sessionId: string
  mode: string
  result: string
  nodeId?: string
  questionId?: string
  date: string
} {
  return {
    id: record.id,
    sessionId: record.sessionId,
    mode: record.mode,
    result: record.result,
    ...(record.nodeId === undefined ? {} : { nodeId: record.nodeId }),
    ...(record.questionId === undefined ? {} : { questionId: record.questionId }),
    date: record.date,
  }
}

export function toRetrospectiveDto(retro: RetrospectiveSummary): {
  id: string
  assessmentId?: string
  adjustEventIds: string[]
  date: string
  worked: string
  failed: string
  nextAdjustment: string
} {
  return {
    id: retro.id,
    ...(retro.assessmentId === undefined ? {} : { assessmentId: retro.assessmentId }),
    adjustEventIds: retro.adjustEventIds,
    date: retro.date,
    worked: retro.worked,
    failed: retro.failed,
    nextAdjustment: retro.nextAdjustment,
  }
}
