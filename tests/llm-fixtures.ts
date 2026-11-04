import { LlmConfig } from '../src/llm/config.js'

export function testConfig(
  overrides: Partial<{
    apiKey: string
    baseUrl: string
    model: string
    timeoutMs: number
    maxRetries: number
    maxTokens: number
    maxInputChars: number
  }> = {},
): LlmConfig {
  return new LlmConfig({
    apiKey: overrides.apiKey ?? 'sk-test-key',
    baseUrl: overrides.baseUrl ?? 'https://llm.test',
    model: overrides.model ?? 'deepseek-chat',
    timeoutMs: overrides.timeoutMs ?? 1_000,
    maxRetries: overrides.maxRetries ?? 2,
    maxTokens: overrides.maxTokens ?? 16_000,
    maxInputChars: overrides.maxInputChars ?? 100_000,
  })
}

export function completion(text: string, model = 'deepseek-chat'): unknown {
  return {
    id: 'chatcmpl-test',
    model,
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export function sseResponse(chunks: readonly string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

export interface FetchCall {
  url: string
  init: RequestInit
}

export interface FakeFetch {
  fetch: typeof fetch
  calls: FetchCall[]
}

/** 按调用顺序返回响应；用一个函数可以把「第几次调用」写得可读 */
export function fakeFetch(
  handler: (call: FetchCall, index: number) => Response | Promise<Response>,
): FakeFetch {
  const calls: FetchCall[] = []
  const impl = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const call = { url: String(input), init: init ?? {} }
    calls.push(call)
    return handler(call, calls.length - 1)
  }) as typeof fetch
  return { fetch: impl, calls }
}

export interface Sleeps {
  sleep: (ms: number) => Promise<void>
  delays: number[]
}

export function recordingSleep(): Sleeps {
  const delays: number[] = []
  return {
    delays,
    sleep: async (ms: number) => {
      delays.push(ms)
    },
  }
}
