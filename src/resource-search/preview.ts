import type { GoalSummary } from '../domain/goals.js'
import type { MapNodeSummary } from '../domain/nodes.js'
import type { Profile } from '../domain/profile.js'
import type { LlmDeps } from '../llm/client.js'
import type { LlmConfig } from '../llm/config.js'
import type { SearchProvider } from '../search/types.js'
import { inferMetadata, type ResourceMetadata } from './metadata.js'
import { buildQuery } from './query.js'

export interface ResourceCandidate extends ResourceMetadata {
  nodeId: string
  title: string
  url: string
  snippet: string
}

export interface PreviewResult {
  candidates: ResourceCandidate[]
  perNode: { nodeId: string; query: string; found: number }[]
  warnings: string[]
}

export interface PreviewOptions {
  config: LlmConfig
  goal: GoalSummary
  nodes: readonly MapNodeSummary[]
  profile: Profile
  search: SearchProvider
  deps?: Partial<LlmDeps>
  maxPerNode?: number
}

/**
 * 逐节点检索 → 按 URL 去重 → 一次模型调用补元数据。
 * **不写库**；一次预览最多 `nodes.length` 次搜索 + 1 次模型调用。
 */
export async function previewResources(options: PreviewOptions): Promise<PreviewResult> {
  const { config, goal, nodes, profile, search } = options
  const maxPerNode = options.maxPerNode ?? 5
  const warnings: string[] = []
  const perNode: PreviewResult['perNode'] = []
  const byUrl = new Map<string, ResourceCandidate>()

  for (const node of nodes) {
    const query = buildQuery(node.title, goal.title, profile.mediaPreference)
    const hits = await search.search(query, { maxResults: maxPerNode })
    perNode.push({ nodeId: node.id, query, found: hits.length })

    if (hits.length === 0) {
      warnings.push(`「${node.title}」没搜到可用资源：试试换个说法，或把画像的媒介改成「不限」`)
      continue
    }

    for (const hit of hits) {
      if (byUrl.has(hit.url)) continue
      byUrl.set(hit.url, {
        nodeId: node.id,
        title: hit.title,
        url: hit.url,
        snippet: hit.snippet,
      })
    }
  }

  const untyped = [...byUrl.values()]
  const metadata = await inferMetadata(config, untyped, options.deps ?? {})
  warnings.push(...metadata.warnings)

  return {
    candidates: untyped.map((candidate) => ({
      ...candidate,
      ...(metadata.byUrl.get(candidate.url) ?? {}),
    })),
    perNode,
    warnings,
  }
}
