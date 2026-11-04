import { describe, expect, it } from 'vitest'
import { chat } from '../src/llm/client.js'
import { LlmError } from '../src/llm/errors.js'
import { completion, fakeFetch, jsonResponse, recordingSleep, testConfig } from './llm-fixtures.js'

const messages = [{ role: 'user' as const, content: '你好' }]

describe('LLM chat（非流式）', () => {
  it('成功：返回文本、模型与用量，请求体带 max_tokens 与鉴权头', async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse(completion('你好呀')))
    let tick = 0

    const result = await chat(
      testConfig(),
      { messages },
      { fetch, now: () => (tick += 120), sleep: async () => undefined },
    )

    expect(result.text).toBe('你好呀')
    expect(result.model).toBe('deepseek-chat')
    expect(result.usage).toEqual({ promptTokens: 3, completionTokens: 2 })
    expect(result.durationMs).toBe(120)

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://llm.test/chat/completions')
    const body = JSON.parse(String(calls[0]?.init.body)) as { max_tokens: number }
    expect(body.max_tokens).toBe(16_000)
    const headers = calls[0]?.init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer sk-test-key')
  })

  it('5xx 之后重试成功：恰好两次调用，退避 500ms', async () => {
    const { fetch, calls } = fakeFetch((_call, index) =>
      index === 0 ? new Response('boom', { status: 500 }) : jsonResponse(completion('成功了')),
    )
    const sleep = recordingSleep()

    const result = await chat(
      testConfig(),
      { messages },
      { fetch, sleep: sleep.sleep, random: () => 0 },
    )

    expect(result.text).toBe('成功了')
    expect(calls).toHaveLength(2)
    expect(sleep.delays).toEqual([500])
  })

  it('401 不重试，直接 LLM_AUTH', async () => {
    const { fetch, calls } = fakeFetch(() => new Response('nope', { status: 401 }))
    const sleep = recordingSleep()

    await expect(
      chat(testConfig(), { messages }, { fetch, sleep: sleep.sleep }),
    ).rejects.toMatchObject({ code: 'LLM_AUTH' })

    expect(calls).toHaveLength(1)
    expect(sleep.delays).toEqual([])
  })

  it('429 用完重试次数后抛 LLM_RATE_LIMIT', async () => {
    const { fetch, calls } = fakeFetch(() => new Response('slow down', { status: 429 }))

    await expect(
      chat(testConfig({ maxRetries: 2 }), { messages }, { fetch, sleep: async () => undefined }),
    ).rejects.toMatchObject({ code: 'LLM_RATE_LIMIT' })

    expect(calls).toHaveLength(3)
  })

  it('超时抛 LLM_TIMEOUT，且不重试', async () => {
    const { fetch, calls } = fakeFetch(
      (call) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = (call.init as RequestInit).signal
          signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
          })
        }),
    )

    await expect(
      chat(testConfig({ timeoutMs: 10 }), { messages }, { fetch, sleep: async () => undefined }),
    ).rejects.toMatchObject({ code: 'LLM_TIMEOUT' })

    expect(calls).toHaveLength(1)
  })

  it('输入超限直接拒绝，且不发请求', async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse(completion('不该到这里')))

    await expect(
      chat(testConfig({ maxInputChars: 1 }), { messages }, { fetch }),
    ).rejects.toMatchObject({ code: 'LLM_BAD_INPUT' })

    expect(calls).toHaveLength(0)
  })

  it('返回缺少 message.content 时抛 LLM_BAD_RESPONSE', async () => {
    const { fetch } = fakeFetch(() => jsonResponse({ choices: [{ message: {} }] }))

    await expect(chat(testConfig(), { messages }, { fetch })).rejects.toBeInstanceOf(LlmError)
    await expect(chat(testConfig(), { messages }, { fetch })).rejects.toMatchObject({
      code: 'LLM_BAD_RESPONSE',
    })
  })
})
