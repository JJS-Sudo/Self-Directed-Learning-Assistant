import { describe, expect, it } from 'vitest'
import { chat } from '../src/llm/client.js'
import { LlmError, redactSecrets, toLlmErrorBody } from '../src/llm/errors.js'
import { streamChat } from '../src/llm/stream.js'
import {
  completion,
  fakeFetch,
  jsonResponse,
  recordingSleep,
  sseResponse,
  testConfig,
} from './llm-fixtures.js'

const messages = [{ role: 'user' as const, content: '你好' }]

async function collect(stream: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = []
  for await (const delta of stream) out.push(delta)
  return out
}

describe('错误脱敏与错误体', () => {
  it('把 sk- 开头的密钥替换掉', () => {
    expect(redactSecrets('key=sk-abcdef123456, ok')).toBe('key=[redacted], ok')
    expect(redactSecrets('sk-x')).toBe('sk-x')
  })

  it('LlmError 的字段路径进消息，且顺序稳定', () => {
    const body = toLlmErrorBody(
      new LlmError('LLM_BAD_RESPONSE', '结构不对', ['nodes', 'nodes.0.title']),
    )

    expect(body.code).toBe('LLM_BAD_RESPONSE')
    expect(body.message).toBe('结构不对（字段：nodes、nodes.0.title）')
  })

  it('非 LlmError 折成 INTERNAL 并脱敏', () => {
    const body = toLlmErrorBody(new Error('boom sk-abcdef123456'))

    expect(body.code).toBe('INTERNAL')
    expect(body.message).not.toContain('sk-abcdef123456')
  })
})

describe('chat 的网络与边界', () => {
  it('网络错误会重试，第二次成功后返回', async () => {
    const { fetch, calls } = fakeFetch((_call, index) => {
      if (index === 0) throw new Error('ECONNRESET')
      return jsonResponse(completion('终于成功'))
    })
    const sleep = recordingSleep()

    const result = await chat(
      testConfig(),
      { messages },
      { fetch, sleep: sleep.sleep, random: () => 0 },
    )

    expect(result.text).toBe('终于成功')
    expect(calls).toHaveLength(2)
    expect(sleep.delays).toEqual([500])
  })

  it('调用方已中止：抛 LLM_TIMEOUT 且只调一次', async () => {
    const controller = new AbortController()
    controller.abort()

    const { fetch, calls } = fakeFetch(
      (_call) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = (_call.init as RequestInit).signal
          if (signal?.aborted === true) {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
            return
          }
          signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          )
        }),
    )

    await expect(
      chat(testConfig(), { messages, signal: controller.signal }, { fetch }),
    ).rejects.toMatchObject({ code: 'LLM_TIMEOUT' })

    expect(calls).toHaveLength(1)
  })

  it('200 但不是 JSON：LLM_BAD_RESPONSE，不重试', async () => {
    const { fetch, calls } = fakeFetch(() => new Response('not json', { status: 200 }))

    await expect(
      chat(testConfig(), { messages }, { fetch, sleep: async () => undefined }),
    ).rejects.toMatchObject({ code: 'LLM_BAD_RESPONSE' })

    expect(calls).toHaveLength(1)
  })

  it('durationMs 跨重试累计', async () => {
    let tick = 0
    const { fetch } = fakeFetch((_call, index) =>
      index === 0 ? new Response('boom', { status: 500 }) : jsonResponse(completion('ok')),
    )

    const result = await chat(
      testConfig(),
      { messages },
      { fetch, sleep: async () => undefined, now: () => (tick += 100) },
    )

    expect(result.durationMs).toBeGreaterThan(0)
  })
})

describe('流式的边角', () => {
  it('一次 read 里有多条事件也能全部产出', async () => {
    const chunk =
      'data: {"choices":[{"delta":{"content":"一"}}]}\n\ndata: {"choices":[{"delta":{"content":"二"}}]}\n\n'
    const { fetch } = fakeFetch(() => sseResponse([chunk]))

    expect(await collect(streamChat(testConfig(), { messages }, { fetch }))).toEqual(['一', '二'])
  })

  it('CRLF 换行也能解析', async () => {
    const chunk =
      'data: {"choices":[{"delta":{"content":"甲"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"乙"}}]}\r\n\r\n'
    const { fetch } = fakeFetch(() => sseResponse([chunk]))

    expect(await collect(streamChat(testConfig(), { messages }, { fetch }))).toEqual(['甲', '乙'])
  })

  it('坏事件被跳过，末尾没有换行的最后一行仍会被处理', async () => {
    const chunk = 'data: {broken\n\ndata: {"choices":[{"delta":{"content":"尾"}}]}'
    const { fetch } = fakeFetch(() => sseResponse([chunk]))

    expect(await collect(streamChat(testConfig(), { messages }, { fetch }))).toEqual(['尾'])
  })
})
