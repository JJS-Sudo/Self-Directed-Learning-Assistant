import { z } from 'zod'

const candidateSchema = z.object({
  temp_id: z.string().min(1),
  title: z.string().min(1),
  parent_temp_id: z.string().min(1).nullable().optional(),
  why: z.string().optional(),
})

const edgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: z.enum(['parent', 'sibling', 'related']),
})

export const chunkResponseSchema = z.object({
  nodes: z.array(candidateSchema).min(1).max(30),
  // 新格式：模型直接给带类型的边；旧格式可以只给 parent_temp_id
  edges: z.array(edgeSchema).max(200).optional(),
})

/** AI 自建：一次要 20–30 个知识点，上限放宽到 40 */
export const selfResponseSchema = z.object({
  nodes: z.array(candidateSchema).min(1).max(40),
  edges: z.array(edgeSchema).max(200).optional(),
})

export type ChunkResponse = z.infer<typeof chunkResponseSchema>
