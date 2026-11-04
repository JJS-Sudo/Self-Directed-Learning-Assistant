import type { GoalSummary } from '../domain/goals.js'
import { requireGoal } from '../domain/goals.js'
import { listNodes } from '../domain/nodes.js'
import { listStages } from '../domain/path-stages.js'
import type { Profile } from '../domain/profile.js'
import { readProfileOrDefault } from '../domain/profile.js'
import { listResources } from '../domain/resources.js'
import type { LlmDeps } from '../llm/client.js'
import type { LlmConfig } from '../llm/config.js'
import type { SearchProvider } from '../search/types.js'
import { inferMetadata } from './metadata.js'
import type { PlatformLinkCandidate } from './platform-links.js'
import { platformLinkCandidates } from './platform-links.js'
import { persistResources, type PersistResourceItem } from './persist.js'
import { buildQuery } from './query.js'

export type AutoResourceMode = 'fill' | 'refresh' | 'retry'

export interface AutoStartEvent {
  type: 'start'
  total: number
  searchConfigured: boolean
}

export interface AutoProgressEvent {
  type: 'progress'
  done: number
  total: number
  nodeId: string
  nodeTitle: string
  found: number
}

export interface AutoWarningEvent {
  type: 'warning'
  message: string
}

export interface AutoDoneEvent {
  type: 'done'
  created: number
  linked: number
  skipped: number
  failures: number
  truncated: boolean
}

export interface AutoErrorEvent {
  type: 'error'
  message: string
}

export type AutoResourceEvent =
  AutoStartEvent | AutoProgressEvent | AutoWarningEvent | AutoDoneEvent | AutoErrorEvent

export interface AutoResourceResult {
  created: number
  linked: number
  skipped: number
  failures: number
  truncated: boolean
  warnings: string[]
}

export interface AutoResourceOptions {
  root: string
  goalId: string
  mode?: AutoResourceMode
  /** 只跑这些节点；缺省为路径阶段里的全部节点 */
  nodeIds?: readonly string[]
  /** null = 无 Tavily，走平台搜索页兜底 */
  search?: SearchProvider | null
  /** 有 DeepSeek 时用于一次性判定等级/媒介/时长 */
  llm?: { config: LlmConfig; deps?: Partial<LlmDeps> } | null
  profile?: Profile
  onEvent?: (event: AutoResourceEvent) => void | Promise<void>
  signal?: AbortSignal
  maxNodes?: number
  concurrency?: number
}

const DEFAULT_MAX_NODES = 40
const DEFAULT_CONCURRENCY = 3

function clampTitle(title: string): string {
  return title.trim() === '' ? '未命名节点' : title.trim()
}

async function runPool<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0
  const size = Math.max(1, Math.min(limit, items.length))
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (cursor < items.length) {
        const index = cursor
        cursor += 1
        const item = items[index]
        if (item === undefined) continue
        await worker(item, index)
      }
    }),
  )
}

function defaultMedia(profile: Profile): string {
  return profile.mediaPreference === '视频' ? '视频' : '文字'
}

function platformOf(url: string): string | undefined {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (host.includes('bilibili.com')) return 'B站'
    if (host.includes('youtube.com') || host === 'youtu.be') return 'YouTube'
    if (host === 'zhihu.com') return '知乎'
    if (host.includes('developer.mozilla.org')) return 'MDN'
    if (host.includes('developers.google.com')) return 'Google Developers'
    if (host.includes('github.com')) return 'GitHub'
    if (host.includes('cnblogs.com')) return '博客园'
    if (host.includes('tencent.com')) return '腾讯云'
    if (host.includes('bing.com')) return 'Bing'
    return host
  } catch {
    return undefined
  }
}

function platformItems(
  node: { id: string; title: string },
  profile: Profile,
): PersistResourceItem[] {
  const links: PlatformLinkCandidate[] = platformLinkCandidates(node, profile)
  return links.slice(0, 2).map((link) => ({
    nodeId: link.nodeId,
    title: link.title,
    url: link.url,
    level: link.level,
    media: link.media,
    platform: link.platform,
    unverified: true,
  }))
}

/**
 * 路径落盘后的资源自动补齐：
 * 取路径阶段节点 → 复用已有 → Tavily 检索或平台搜索页兜底 → 一次批量判定 → 落盘。
 */
export async function autoResources(options: AutoResourceOptions): Promise<AutoResourceResult> {
  const { root, goalId } = options
  const mode = options.mode ?? 'fill'
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY
  const search = options.search ?? null
  const profile = options.profile ?? readProfileOrDefault(root)
  const goal: GoalSummary = requireGoal(root, goalId)
  const warnings: string[] = []
  const emit = async (event: AutoResourceEvent): Promise<void> => {
    await options.onEvent?.(event)
  }

  const allNodes = listNodes(root, goal.id)
  const byId = new Map(allNodes.map((node) => [node.id, node]))
  const pathNodeIds = listStages(root, goal.id).flatMap((stage) => stage.nodeIds)
  const requested = options.nodeIds === undefined ? pathNodeIds : options.nodeIds
  const ordered = [...new Set(requested)]
    .map((id) => byId.get(id))
    .filter((node): node is NonNullable<typeof node> => node !== undefined && node !== null)

  if (requested.some((id) => !byId.has(id))) {
    warnings.push('有节点不属于当前目标，已跳过')
  }

  const truncated = ordered.length > maxNodes
  const nodes = ordered.slice(0, maxNodes)
  if (truncated) warnings.push(`节点超过 ${maxNodes} 个，只处理前 ${maxNodes} 个`)

  const existing = listResources(root, { nodeIds: nodes.map((node) => node.id) })
  const hasAny = new Set(existing.flatMap((resource) => resource.nodeIds))
  const hasVerified = new Set(
    existing
      .filter((resource) => resource.unverified !== true)
      .flatMap((resource) => resource.nodeIds),
  )

  const targets = nodes.filter((node) => {
    if (mode === 'retry') return true
    if (mode === 'refresh')
      return search === null ? !hasAny.has(node.id) : !hasVerified.has(node.id)
    return !hasAny.has(node.id)
  })

  await emit({ type: 'start', total: targets.length, searchConfigured: search !== null })
  for (const message of warnings) await emit({ type: 'warning', message })

  const items: PersistResourceItem[] = []
  let done = 0
  let failures = 0

  await runPool(targets, concurrency, async (node) => {
    if (options.signal?.aborted === true) return
    const title = clampTitle(node.title)
    let found = 0
    let failed = false
    try {
      if (search === null) {
        const links = platformItems({ id: node.id, title }, profile)
        found = links.length
        items.push(...links)
      } else {
        const hits = await search.search(buildQuery(title, goal.title, profile.mediaPreference), {
          maxResults: 2,
        })
        const usable = hits.slice(0, 2)
        found = usable.length
        for (const hit of usable) {
          items.push({
            nodeId: node.id,
            title: hit.title.trim() === '' ? title : hit.title,
            url: hit.url,
            level: profile.level,
            media: defaultMedia(profile),
            ...(platformOf(hit.url) === undefined ? {} : { platform: platformOf(hit.url) }),
            snippet: hit.snippet,
          })
        }
      }
    } catch (error) {
      failed = true
      failures += 1
      const reason = error instanceof Error ? error.message : String(error)
      const message = `「${title}」检索失败：${reason}`
      warnings.push(message)
      await emit({ type: 'warning', message })
    }

    if (found === 0) {
      if (!failed) {
        failures += 1
        const message = `「${title}」没有找到资源`
        warnings.push(message)
        await emit({ type: 'warning', message })
      }
    }

    done += 1
    await emit({
      type: 'progress',
      done,
      total: targets.length,
      nodeId: node.id,
      nodeTitle: title,
      found,
    })
  })

  // 一次批量判定所有新资源；无 Key 时保留默认值，不额外花钱
  if (search !== null && items.length > 0) {
    if (options.llm?.config.configured === true) {
      try {
        const metadata = await inferMetadata(
          options.llm.config,
          items.map((item) => ({ url: item.url, title: item.title, snippet: item.snippet ?? '' })),
          options.llm.deps ?? {},
        )
        for (const item of items) {
          const extra = metadata.byUrl.get(item.url)
          if (extra === undefined) continue
          if (extra.level !== undefined) item.level = extra.level
          if (extra.media !== undefined) item.media = extra.media
          if (extra.durationMin !== undefined) item.durationMin = extra.durationMin
        }
        for (const message of metadata.warnings) {
          warnings.push(message)
          await emit({ type: 'warning', message })
        }
      } catch (error) {
        const message = `资源判定失败，已使用默认等级/媒介：${
          error instanceof Error ? error.message : String(error)
        }`
        warnings.push(message)
        await emit({ type: 'warning', message })
      }
    } else {
      const message = '未配置 DeepSeek，资源的等级/媒介使用画像默认值'
      warnings.push(message)
      await emit({ type: 'warning', message })
    }
  }

  // 同一 URL 被多个节点命中时只保留一条；persist 会把后续节点追加为共享
  const seen = new Set<string>()
  const unique: PersistResourceItem[] = []
  for (const item of items) {
    const key = `${item.nodeId}\u0000${item.url}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(item)
  }

  const result = persistResources(root, goal.id, unique)
  warnings.push(...result.warnings)
  await emit({
    type: 'done',
    created: result.created,
    linked: result.linked,
    skipped: result.skipped.length,
    failures,
    truncated,
  })

  return {
    created: result.created,
    linked: result.linked,
    skipped: result.skipped.length,
    failures,
    truncated,
    warnings,
  }
}
