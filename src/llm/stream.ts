import type { LlmConfig } from './config.js'
import {
  assertConfigured,
  assertInputSize,
  buildBody,
  resolveDeps,
  sendRequest,
  statusError,
  type ChatRequest,
  type LlmDeps,
} from './client.js'
import { LlmError } from './errors.js'

function parseLine(line: string): string | 'done' | null {
  if (!line.startsWith('data:')) return null
  const data = line.slice(5).trim()
  if (data === '') return null
  if (data === '[DONE]') return 'done'

  try {
    const payload = JSON.parse(data) as unknown
    if (typeof payload !== 'object' || payload === null) return null
    const choices = (payload as Record<string, unknown>)['choices']
    const first = Array.isArray(choices) ? choices[0] : undefined
    if (typeof first !== 'object' || first === null) return null
    const delta = (first as Record<string, unknown>)['delta']
    const content =
      typeof delta === 'object' && delta !== null
        ? (delta as Record<string, unknown>)['content']
        : undefined
    return typeof content === 'string' && content !== '' ? content : null
  } catch {
    // 单个事件坏掉不该中断整条流
    return null
  }
}

/**
 * 按行解析 SSE。**必须缓冲**：一次 `read()` 可能只拿到半行。
 * `[DONE]` 结束；中止信号在当前行处理完后生效。
 */
async function* parseSse(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string, void, void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      if (signal?.aborted === true) return
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      let newline = buffer.indexOf('\n')
      while (newline !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, '')
        buffer = buffer.slice(newline + 1)
        const event = parseLine(line)
        if (event === 'done') return
        if (event !== null) yield event
        newline = buffer.indexOf('\n')
      }
    }

    const tail = parseLine(buffer.replace(/\r$/, ''))
    if (tail !== null && tail !== 'done') yield tail
  } finally {
    reader.releaseLock()
  }
}

/**
 * 流式对话：产出增量文本。连接阶段失败照常抛 LlmError；
 * 一旦开始出字就不再重试（避免重复输出）。
 */
export async function* streamChat(
  config: LlmConfig,
  request: ChatRequest,
  partialDeps: Partial<LlmDeps> = {},
): AsyncGenerator<string, void, void> {
  assertConfigured(config)
  assertInputSize(config, request.messages)

  const deps = resolveDeps(partialDeps)
  const response = await sendRequest(
    config,
    buildBody(config, request, { stream: true }),
    request,
    deps,
  )
  const error = statusError(response.status)
  if (error !== undefined) throw error

  if (response.body === null) {
    throw new LlmError('LLM_BAD_RESPONSE', '模型没有返回流式响应体')
  }

  yield* parseSse(response.body, request.signal)
}
