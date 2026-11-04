import { describe, expect, it } from 'vitest'
import { streamChat } from '../src/llm/stream.js'
import { fakeFetch, sseResponse, testConfig } from './llm-fixtures.js'

const messages = [{ role: 'user' as const, content: '讲个短句' }]

async function collect(stream: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = []
  for await (const delta of stream) out.push(delta)
  return out
}

const SSE = [
  'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
  'data: {"choices":[{"delta":{"content":"好"}}]}\n\n',
  'data: [DONE]\n\n',
].join('')

describe('LLM 流式', () => {
  it('按增量产出，并在 [DONE] 结束', async () => {
    const { fetch } = fakeFetch(() => sseResponse([SSE]))
    const deltas = await collect(streamChat(testConfig(), { messages }, { fetch }))

    expect(deltas).toEqual(['你', '好'])
  })

  it('半行分块也能正确拼接（按字符切碎）', async () => {
    const { fetch } = fakeFetch(() => sseResponse([...SSE]))
    const deltas = await collect(streamChat(testConfig(), { messages }, { fetch }))

    expect(deltas).toEqual(['你', '好'])
  })

  it('[DONE] 之后的内容不再产出', async () => {
    const { fetch } = fakeFetch(() =>
      sseResponse([SSE, 'data: {"choices":[{"delta":{"content":"不该出现"}}]}\n\n']),
    )
    const deltas = await collect(streamChat(testConfig(), { messages }, { fetch }))

    expect(deltas).toEqual(['你', '好'])
  })

  it('调用方中止后立即结束，不产出剩余内容', async () => {
    const controller = new AbortController()
    controller.abort()
    const { fetch } = fakeFetch(() => sseResponse([SSE]))

    const deltas = await collect(
      streamChat(testConfig(), { messages, signal: controller.signal }, { fetch }),
    )

    expect(deltas).toEqual([])
  })

  it('上游 5xx 抛 LLM_UPSTREAM', async () => {
    const { fetch } = fakeFetch(() => new Response('boom', { status: 503 }))

    await expect(collect(streamChat(testConfig(), { messages }, { fetch }))).rejects.toMatchObject({
      code: 'LLM_UPSTREAM',
    })
  })
})
