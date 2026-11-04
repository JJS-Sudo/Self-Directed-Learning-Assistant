import { z } from 'zod'

const questionSchema = z.object({
  temp_id: z.string().min(1),
  kind: z.enum(['封闭', '开放']),
  stem: z.string().min(1),
  answer: z.string().optional(),
  explanation: z.string().optional(),
  node_id: z.string().optional(),
})

const stageSchema = z.object({
  temp_id: z.string().min(1),
  title: z.string().min(1),
  estimate: z.string().min(1),
  node_ids: z.array(z.string().min(1)).min(1),
  checks: z.array(z.string().min(1)).min(1),
  deliverable: z.string().optional(),
  questions: z.array(questionSchema).min(1),
})

export const pathResponseSchema = z.object({
  stages: z.array(stageSchema).min(1),
})

export type PathResponse = z.infer<typeof pathResponseSchema>
