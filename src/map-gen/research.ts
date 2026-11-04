import type { GoalSummary } from '../domain/goals.js'
import { createTavilyProvider } from '../search/tavily.js'
import type { SearchHit, SearchProvider } from '../search/types.js'

export interface ResearchContext {
  used: boolean
  sources: { title: string; url: string }[]
  summary: string
  warnings: string[]
}

export interface ResearchDeps {
  search?: SearchProvider
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 无材料生成时，先尝试联网找资料：
 * - 有 Tavily key：用「目标标题」「成功判据」各搜一次，取前 5 条摘要；
 * - 没有 key / 搜失败：返回 used=false + 警告，由调用方降级为纯模型。
 */
export async function researchForGoal(
  goal: GoalSummary,
  env: NodeJS.ProcessEnv,
  deps: ResearchDeps = {},
): Promise<ResearchContext> {
  const provider = deps.search ?? createTavilyProvider({ env })
  const queries = [goal.title.trim()]
  if (goal.successCriteria !== undefined && goal.successCriteria.trim() !== '') {
    queries.push(goal.successCriteria.trim())
  }

  try {
    const hits: SearchHit[] = []
    for (const query of queries) {
      hits.push(...(await provider.search(query, { maxResults: 5 })))
    }

    const seen = new Set<string>()
    const unique = hits.filter((hit) => {
      if (seen.has(hit.url)) return false
      seen.add(hit.url)
      return true
    })
    const top = unique.slice(0, 5)
    if (top.length === 0) {
      return {
        used: false,
        sources: [],
        summary: '',
        warnings: ['未联网：检索没有返回结果，仅用模型已有知识'],
      }
    }

    return {
      used: true,
      sources: top.map((hit) => ({ title: hit.title, url: hit.url })),
      summary: top
        .map((hit) => `- ${hit.title}（${hit.url}）：${hit.snippet.slice(0, 400)}`)
        .join('\n'),
      warnings: [],
    }
  } catch (error) {
    return {
      used: false,
      sources: [],
      summary: '',
      warnings: [`未联网：${messageOf(error)}；本次仅用模型已有知识拆解`],
    }
  }
}
