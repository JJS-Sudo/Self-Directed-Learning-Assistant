import { describe, expect, it } from 'vitest'
import { createTavilyProvider } from '../src/search/tavily.js'

interface Call {
  url: string
  init: RequestInit
}

function fakeFetch(handler: (call: Call, index: number) => Response | Promise<Response>): {
  fetch: typeof fetch
  calls: Call[]
} {
  const calls: Call[] = []
  const fetchImpl = (async (input: unknown, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} }
    calls.push(call)
    return handler(call, calls.length - 1)
  }) as typeof fetch
  return { fetch: fetchImpl, calls }
}

const env = { TAVILY_API_KEY: 'tvly-test', SDL_TAVILY_BASE_URL: 'https://tavily.test' }

function bodyOf(call: Call | undefined): Record<string, unknown> {
  return JSON.parse(String(call?.init.body)) as Record<string, unknown>
}

describe('Tavily 提供方', () => {
  it('没有 key：不发请求，报 SEARCH_NOT_CONFIGURED', async () => {
    const { fetch, calls } = fakeFetch(() => new Response('{}'))
    const provider = createTavilyProvider({ env: {}, fetchImpl: fetch })

    await expect(provider.search('x')).rejects.toMatchObject({ code: 'SEARCH_NOT_CONFIGURED' })
    expect(calls).toHaveLength(0)
  })

  it('请求体带 query 与 max_results，解析真实返回', async () => {
    const { fetch, calls } = fakeFetch(
      () =>
        new Response(
          JSON.stringify({
            results: [
              { title: 'B 站视频', url: 'https://b23.tv/abc', content: '讲最小二乘' },
              { title: '', url: 'https://example.com/a', content: '' },
            ],
          }),
          { status: 200 },
        ),
    )
    const provider = createTavilyProvider({ env, fetchImpl: fetch })

    const hits = await provider.search('最小二乘 视频', { maxResults: 3 })

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://tavily.test/search')
    expect(bodyOf(calls[0])).toMatchObject({
      api_key: 'tvly-test',
      query: '最小二乘 视频',
      max_results: 3,
    })
    expect(hits).toEqual([
      { title: 'B 站视频', url: 'https://b23.tv/abc', snippet: '讲最小二乘' },
      { title: 'https://example.com/a', url: 'https://example.com/a', snippet: '' },
    ])
  })

  it('空 url 与重复 url 会被丢弃', async () => {
    const { fetch } = fakeFetch(
      () =>
        new Response(
          JSON.stringify({
            results: [
              { title: 'a', url: 'https://x.test/1', content: '' },
              { title: 'a2', url: 'https://x.test/1', content: '' },
              { title: 'b', url: '   ', content: '' },
            ],
          }),
        ),
    )
    const provider = createTavilyProvider({ env, fetchImpl: fetch })

    expect(await provider.search('q')).toHaveLength(1)
  })

  it.each([
    [401, 'SEARCH_AUTH'],
    [429, 'SEARCH_RATE_LIMIT'],
    [500, 'SEARCH_UPSTREAM'],
  ])('HTTP %i → %s', async (status, code) => {
    const { fetch } = fakeFetch(() => new Response('nope', { status }))
    const provider = createTavilyProvider({ env, fetchImpl: fetch })

    await expect(provider.search('q')).rejects.toMatchObject({ code })
  })

  it('超时 → SEARCH_TIMEOUT', async () => {
    const hanging = ((_input: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        )
      })) as typeof fetch
    const provider = createTavilyProvider({ env: { ...env }, fetchImpl: hanging, timeoutMs: 10 })

    await expect(provider.search('q')).rejects.toMatchObject({ code: 'SEARCH_TIMEOUT' })
  })

  it('结构不对 → SEARCH_BAD_RESPONSE', async () => {
    const { fetch } = fakeFetch(() => new Response(JSON.stringify({ results: 'no' })))
    const provider = createTavilyProvider({ env, fetchImpl: fetch })

    await expect(provider.search('q')).rejects.toMatchObject({ code: 'SEARCH_BAD_RESPONSE' })
  })

  it('网络错误 → SEARCH_UPSTREAM', async () => {
    const { fetch } = fakeFetch(() => {
      throw new Error('ECONNRESET')
    })
    const provider = createTavilyProvider({ env, fetchImpl: fetch })

    await expect(provider.search('q')).rejects.toMatchObject({ code: 'SEARCH_UPSTREAM' })
  })
})
