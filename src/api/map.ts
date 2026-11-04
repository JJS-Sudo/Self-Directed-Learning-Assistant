import { z } from 'zod'
import type { MapNodeSummary, NodeLink } from '../domain/nodes.js'
import { MASTERY_VALUES } from '../domain/vocabulary.js'
import type { RawEdge } from '../map-gen/types.js'
import type { LinkType, MapNodeDto } from '../shared/map.js'

export const materialSchema = z.object({
  material: z.string().trim().min(1, '不能为空').max(200_000, '最长 200000 字符'),
})

export const linkTypeSchema = z.enum(['parent', 'sibling', 'related'])

const candidateSchema = z.object({
  tempId: z.string().min(1),
  title: z.string().trim().min(1, '标题不能为空').max(120, '标题最长 120 字'),
  parentTempId: z.string().min(1).optional(),
  why: z.string().max(300).optional(),
})

export const candidatesSchema = z.object({
  candidates: z.array(candidateSchema).min(1, '至少需要一个候选').max(200, '一次最多 200 个候选'),
  edges: z
    .array(
      z.object({
        from: z.string().min(1),
        to: z.string().min(1),
        type: linkTypeSchema,
      }),
    )
    .max(500)
    .optional(),
})

export const nodePatchSchema = z
  .object({
    title: z.string().trim().min(1, '标题不能为空').max(120, '标题最长 120 字').optional(),
    order: z.number().int().min(0).optional(),
    mastery: z.enum(MASTERY_VALUES).optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined || value.order !== undefined || value.mastery !== undefined,
    { message: '至少改一项（title / order / mastery）' },
  )

export const createNodeSchema = z.object({
  title: z.string().trim().min(1, '标题不能为空').max(120, '标题最长 120 字'),
  parentNodeId: z.string().min(1).optional(),
})

export const linkSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: linkTypeSchema,
})

export const layoutSchema = z.object({
  positions: z
    .array(
      z.object({
        id: z.string().min(1),
        x: z.number().finite(),
        y: z.number().finite(),
      }),
    )
    .max(500),
})

export type CandidateInput = z.infer<typeof candidateSchema>

/** 每块几个小节；非法值回落到 8 */
export function chunkSizeFromEnv(env: NodeJS.ProcessEnv): number {
  const raw = env['SDL_MAP_CHUNK_SECTIONS']
  const parsed = raw === undefined ? Number.NaN : Number(raw)
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 8
}

function toLinks(links: readonly NodeLink[]): { to: string; type: LinkType }[] {
  return links.map((link) => ({ to: link.to, type: link.type }))
}

/** 内部边用 fromTempId/toTempId；接口统一成 from/to */
export function toEdgeDtos(
  edges: readonly RawEdge[],
): { from: string; to: string; type: LinkType }[] {
  return edges.map((edge) => ({ from: edge.fromTempId, to: edge.toTempId, type: edge.type }))
}

export function toMapNodeDto(node: MapNodeSummary): MapNodeDto {
  return {
    id: node.id,
    title: node.title,
    mastery: node.mastery,
    order: node.order,
    links: toLinks(node.links),
    ...(node.upId === undefined ? {} : { upId: node.upId }),
  }
}
