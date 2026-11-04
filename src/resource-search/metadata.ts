import { z } from 'zod'
import { LEVELS, MEDIA_TYPES } from '../domain/vocabulary.js'
import type { LlmDeps } from '../llm/client.js'
import type { LlmConfig } from '../llm/config.js'
import { requestJson } from '../llm/structured.js'

export interface MetadataCandidate {
  url: string
  title: string
  snippet: string
}

export interface ResourceMetadata {
  level?: string
  media?: string
  durationMin?: number
}

/** 结构放宽到 string/number，逐项校验词表 —— 这样非法值能被单独丢弃并报告，而不是整批失败 */
const responseSchema = z.object({
  items: z.array(
    z.object({
      url: z.string(),
      level: z.string().optional(),
      media: z.string().optional(),
      duration_min: z.number().optional(),
    }),
  ),
})

const SYSTEM_PROMPT = [
  '你是学习资源整理助手。只输出 JSON，不要解释。',
  '输入是搜索结果（url、标题、摘要）。为每条判断：',
  `- level：只能是 ${LEVELS.join(' / ')} 之一（面向初学/进阶/熟练）；`,
  `- media：只能是 ${MEDIA_TYPES.join(' / ')} 之一；`,
  '- duration_min：整数分钟，只有能从标题/摘要明确看出时长的才写，否则不要写这个字段；',
  '判断不了就省略字段，禁止编造。',
  '输出格式：{"items":[{"url":"…","level":"入门","media":"视频","duration_min":18}]}',
].join('\n')

/**
 * 一次模型调用，把候选批量判成 level / media / duration_min。
 * 非法或缺失的字段一律留空并记警告，**不猜**。
 */
export async function inferMetadata(
  config: LlmConfig,
  candidates: readonly MetadataCandidate[],
  partialDeps: Partial<LlmDeps> = {},
): Promise<{ byUrl: Map<string, ResourceMetadata>; warnings: string[] }> {
  const warnings: string[] = []
  if (candidates.length === 0) return { byUrl: new Map(), warnings }

  const known = new Set(candidates.map((candidate) => candidate.url))
  const response = await requestJson(
    config,
    {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify(
            candidates.map((candidate) => ({
              url: candidate.url,
              title: candidate.title,
              snippet: candidate.snippet.slice(0, 300),
            })),
          ),
        },
      ],
      schema: responseSchema,
    },
    partialDeps,
  )

  const byUrl = new Map<string, ResourceMetadata>()
  for (const item of response.value.items) {
    if (!known.has(item.url)) continue

    const level =
      item.level !== undefined && (LEVELS as readonly string[]).includes(item.level)
        ? item.level
        : undefined
    if (item.level !== undefined && level === undefined) {
      warnings.push(`等级不在词表，已忽略：${item.url}（${item.level}）`)
    }

    const media =
      item.media !== undefined && (MEDIA_TYPES as readonly string[]).includes(item.media)
        ? item.media
        : undefined
    if (item.media !== undefined && media === undefined) {
      warnings.push(`媒介不在词表，已忽略：${item.url}（${item.media}）`)
    }

    const duration =
      item.duration_min !== undefined &&
      Number.isInteger(item.duration_min) &&
      item.duration_min > 0
        ? item.duration_min
        : undefined
    if (item.duration_min !== undefined && duration === undefined) {
      warnings.push(`时长不是正整数，已忽略：${item.url}（${item.duration_min}）`)
    }

    byUrl.set(item.url, {
      ...(level === undefined ? {} : { level }),
      ...(media === undefined ? {} : { media }),
      ...(duration === undefined ? {} : { durationMin: duration }),
    })
  }

  const missing = candidates.filter((candidate) => {
    const metadata = byUrl.get(candidate.url)
    return metadata === undefined || (metadata.level === undefined && metadata.media === undefined)
  })
  if (missing.length > 0) {
    warnings.push(
      `有 ${missing.length} 条候选没判出等级/媒介，已留空，请在审核页补：` +
        missing
          .slice(0, 3)
          .map((candidate) => candidate.title)
          .join('、'),
    )
  }

  return { byUrl, warnings }
}
