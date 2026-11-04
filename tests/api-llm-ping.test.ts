import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { completion, fakeFetch, jsonResponse } from './llm-fixtures.js'
import { createEmptyVault, removeDir } from './helpers.js'

const dirs: string[] = []

function makeApp(env: NodeJS.ProcessEnv, fetchImpl: typeof fetch) {
  const root = createEmptyVault()
  dirs.push(root)
  return createApp({
    vaultPath: root,
    env,
    llmDeps: { fetch: fetchImpl, sleep: async () => undefined },
  })
}

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDir(dir)
})

describe('POST /api/llm/ping', () => {
  it('没有 key：200 + configured:false，且不发起任何上游请求', async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse(completion('好')))
    const app = makeApp({}, fetch)

    const response = await app.request('/api/llm/ping', { method: 'POST' })
    const body = (await response.json()) as { configured: boolean; ok: boolean }

    expect(response.status).toBe(200)
    expect(body).toEqual({ configured: false, ok: false })
    expect(calls).toHaveLength(0)
  })

  it('有 key：返回模型名与耗时，响应体不含密钥', async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse(completion('好')))
    const app = makeApp({ DEEPSEEK_API_KEY: 'sk-test-key' }, fetch)

    const response = await app.request('/api/llm/ping', { method: 'POST' })
    const text = await response.text()

    expect(response.status).toBe(200)
    expect(text).not.toContain('sk-test-key')
    const body = JSON.parse(text) as {
      configured: boolean
      ok: boolean
      model: string
      durationMs: number
    }
    expect(body.configured).toBe(true)
    expect(body.ok).toBe(true)
    expect(body.model).toBe('deepseek-chat')
    expect(typeof body.durationMs).toBe('number')
    expect(calls).toHaveLength(1)

    const payload = JSON.parse(String(calls[0]?.init.body)) as { max_tokens: number }
    expect(payload.max_tokens).toBe(1)
  })

  it('凭据被拒：502 LLM_AUTH，且不泄露密钥与上游报文', async () => {
    const { fetch } = fakeFetch(() => new Response('invalid api key sk-test-key', { status: 401 }))
    const app = makeApp({ DEEPSEEK_API_KEY: 'sk-test-key' }, fetch)

    const response = await app.request('/api/llm/ping', { method: 'POST' })
    const text = await response.text()

    expect(response.status).toBe(502)
    expect(text).toContain('LLM_AUTH')
    expect(text).not.toContain('sk-test-key')
    expect(text).not.toContain('invalid api key')
  })

  it('限流：429 LLM_RATE_LIMIT（重试设为 0 时只调一次）', async () => {
    const { fetch, calls } = fakeFetch(() => new Response('slow', { status: 429 }))
    const app = makeApp({ DEEPSEEK_API_KEY: 'sk-test-key', SDL_LLM_MAX_RETRIES: '0' }, fetch)

    const response = await app.request('/api/llm/ping', { method: 'POST' })

    expect(response.status).toBe(429)
    expect(calls).toHaveLength(1)
  })

  it('只接受 POST（GET 是 404，避免被预取成扣费调用）', async () => {
    const { fetch } = fakeFetch(() => jsonResponse(completion('好')))
    const app = makeApp({ DEEPSEEK_API_KEY: 'sk-test-key' }, fetch)

    const response = await app.request('/api/llm/ping')

    expect(response.status).toBe(404)
  })
})
