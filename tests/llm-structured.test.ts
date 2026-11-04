import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { requestJson } from '../src/llm/structured.js'
import { completion, fakeFetch, jsonResponse, testConfig } from './llm-fixtures.js'

const schema = z.object({ nodes: z.array(z.string()) })
const messages = [{ role: 'user' as const, content: '拆成节点' }]

describe('结构化输出与修复重试', () => {
  it('一次就对：只调用上游一次', async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse(completion('{"nodes":["a","b"]}')))

    const result = await requestJson(testConfig(), { messages, schema }, { fetch })

    expect(result.value).toEqual({ nodes: ['a', 'b'] })
    expect(calls).toHaveLength(1)
  })

  it('坏结构：恰好修复一次，第二次成功，且修复消息里带字段路径', async () => {
    const { fetch, calls } = fakeFetch((_call, index) =>
      index === 0
        ? jsonResponse(completion('{"nodes":"oops"}'))
        : jsonResponse(completion('{"nodes":["修好了"]}')),
    )

    const result = await requestJson(testConfig(), { messages, schema }, { fetch })

    expect(result.value).toEqual({ nodes: ['修好了'] })
    expect(calls).toHaveLength(2)

    const repairBody = JSON.parse(String(calls[1]?.init.body)) as {
      messages: { role: string; content: string }[]
    }
    const last = repairBody.messages.at(-1)
    expect(last?.role).toBe('user')
    expect(last?.content).toContain('nodes')
  })

  it('两次都坏：抛 LLM_BAD_RESPONSE，并带上字段路径', async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse(completion('{"nodes":1}')))

    await expect(requestJson(testConfig(), { messages, schema }, { fetch })).rejects.toMatchObject({
      code: 'LLM_BAD_RESPONSE',
      details: ['nodes'],
    })

    expect(calls).toHaveLength(2)
  })

  it('输出不是 JSON 时也走修复路径', async () => {
    const { fetch, calls } = fakeFetch((_call, index) =>
      index === 0
        ? jsonResponse(completion('这不是 JSON'))
        : jsonResponse(completion('{"nodes":["ok"]}')),
    )

    const result = await requestJson(testConfig(), { messages, schema }, { fetch })

    expect(result.value).toEqual({ nodes: ['ok'] })
    expect(calls).toHaveLength(2)
  })
})
