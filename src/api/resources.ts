import { z } from 'zod'
import { LEVELS, MEDIA_TYPES } from '../domain/vocabulary.js'
import type { RankedResource } from '../domain/resources.js'

export const previewResourcesSchema = z.object({
  nodeIds: z.array(z.string().min(1)).min(1, '至少选一个节点').max(200, '一次最多检索 200 个节点'),
})

export const autoResourcesSchema = z.object({
  nodeIds: z.array(z.string().min(1)).min(1).max(200).optional(),
  mode: z.enum(['fill', 'refresh', 'retry']).optional(),
})

export const commitResourcesSchema = z.object({
  resources: z
    .array(
      z.object({
        nodeId: z.string().min(1),
        title: z.string().trim().min(1, '标题不能为空'),
        url: z.string().trim().min(1, 'URL 不能为空'),
        level: z.enum(LEVELS),
        media: z.enum(MEDIA_TYPES),
        durationMin: z.coerce.number().int().positive().optional(),
      }),
    )
    .min(1, '至少一条资源')
    .max(500),
})

export type CommitResourcesInput = z.infer<typeof commitResourcesSchema>
export type CommitResourceItem = CommitResourcesInput['resources'][number]

export function toResourceDto(
  resource: RankedResource,
  nodeTitle: (id: string) => string,
): {
  id: string
  title: string
  url?: string
  nodeId?: string
  nodeTitle?: string
  nodeIds: string[]
  unverified?: boolean
  level: string
  media: string
  durationMin?: number
  score: number
  rankReason: string
} {
  return {
    id: resource.id,
    title: resource.title,
    ...(resource.url === undefined ? {} : { url: resource.url }),
    ...(resource.nodeId === undefined ? {} : { nodeId: resource.nodeId }),
    ...(resource.nodeId === undefined ? {} : { nodeTitle: nodeTitle(resource.nodeId) }),
    nodeIds: resource.nodeIds,
    ...(resource.unverified === true ? { unverified: true } : {}),
    level: resource.level,
    media: resource.media,
    ...(resource.durationMin === undefined ? {} : { durationMin: resource.durationMin }),
    score: resource.score,
    rankReason: resource.rankReason,
  }
}
