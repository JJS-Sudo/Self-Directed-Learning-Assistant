import { z } from 'zod'
import { SearchError } from './errors.js'
import type { SearchHit, SearchOptions, SearchProvider } from './types.js'

const DEFAULT_BASE_URL = 'https://api.tavily.com'
const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_MAX_RESULTS = 5

const responseSchema = z.object({
  results: z
    .array(
      z.object({
        title: z.string().optional(),
        url: z.string(),
        content: z.string().optional(),
      }),
    )
    .optional(),
})

export interface TavilyOptions {
  env?: NodeJS.ProcessEnv
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

function configured(env: NodeJS.ProcessEnv): { apiKey: string; baseUrl: string } {
  return {
    apiKey: (env['TAVILY_API_KEY'] ?? '').trim(),
    baseUrl: ((env['SDL_TAVILY_BASE_URL'] ?? DEFAULT_BASE_URL) as string).replace(/\/+$/, ''),
  }
}

function statusError(status: number): SearchError {
  if (status === 401 || status === 403) {
    return new SearchError('SEARCH_AUTH', '搜索服务拒绝了凭据：检查 TAVILY_API_KEY')
  }
  if (status === 429) {
    return new SearchError('SEARCH_RATE_LIMIT', '搜索服务限流：稍后再试或减少节点数')
  }
  return new SearchError('SEARCH_UPSTREAM', `搜索服务返回 HTTP ${status}`)
}

function parseHits(body: unknown): SearchHit[] {
  const parsed = responseSchema.safeParse(body)
  if (!parsed.success) {
    throw new SearchError('SEARCH_BAD_RESPONSE', '搜索服务返回了无法解析的结构')
  }

  const seen = new Set<string>()
  const hits: SearchHit[] = []
  for (const item of parsed.data.results ?? []) {
    const url = item.url.trim()
    if (url === '' || seen.has(url)) continue
    seen.add(url)
    hits.push({
      title: (item.title ?? '').trim() === '' ? url : (item.title as string).trim(),
      url,
      snippet: (item.content ?? '').trim(),
    })
  }
  return hits
}

export function createTavilyProvider(options: TavilyOptions = {}): SearchProvider {
  const env = options.env ?? process.env
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? Number(env['SDL_TAVILY_TIMEOUT_MS'] ?? DEFAULT_TIMEOUT_MS)

  return {
    async search(query: string, searchOptions: SearchOptions = {}): Promise<SearchHit[]> {
      const { apiKey, baseUrl } = configured(env)
      if (apiKey === '') {
        throw new SearchError('SEARCH_NOT_CONFIGURED', '未配置 TAVILY_API_KEY')
      }

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await fetchImpl(`${baseUrl}/search`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            api_key: apiKey,
            query,
            max_results: searchOptions.maxResults ?? DEFAULT_MAX_RESULTS,
            search_depth: 'basic',
            include_answer: false,
          }),
          signal: controller.signal,
        })

        if (!response.ok) throw statusError(response.status)
        return parseHits(await response.json())
      } catch (error) {
        if (error instanceof SearchError) throw error
        if (controller.signal.aborted) {
          throw new SearchError('SEARCH_TIMEOUT', `搜索超时（${timeoutMs}ms）`)
        }
        throw new SearchError('SEARCH_UPSTREAM', '搜索请求失败：网络错误')
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
