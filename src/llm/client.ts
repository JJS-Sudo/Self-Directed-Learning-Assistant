import type { LlmConfig } from './config.js'
import { LlmError } from './errors.js'

export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export interface LlmDeps {
  fetch: typeof fetch
  sleep: (ms: number) => Promise<void>
  now: () => number
  /** 注入随机源：测试里给 0，退避时间就是确定的 */
  random: () => number
  /** 每次逻辑调用结束（成功或失败）回调一次，用于记录费用 */
  recorder?: (event: LlmCallEvent) => void
}

export interface LlmCallEvent {
  ok: boolean
  usage?: ChatUsage
  durationMs?: number
  error?: string
}

export const defaultDeps: LlmDeps = {
  fetch: (input, init) => globalThis.fetch(input, init),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
  random: () => Math.random(),
}

export function resolveDeps(partial: Partial<LlmDeps> = {}): LlmDeps {
  return {
    fetch: partial.fetch ?? defaultDeps.fetch,
    sleep: partial.sleep ?? defaultDeps.sleep,
    now: partial.now ?? defaultDeps.now,
    random: partial.random ?? defaultDeps.random,
    ...(partial.recorder === undefined ? {} : { recorder: partial.recorder }),
  }
}

export interface ChatRequest {
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  responseFormat?: 'json_object'
  signal?: AbortSignal
}

export interface ChatUsage {
  promptTokens?: number
  completionTokens?: number
}

export interface ChatResult {
  text: string
  model: string
  usage: ChatUsage
  durationMs: number
}

export function chatEndpoint(config: LlmConfig): string {
  return `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`
}

export function assertConfigured(config: LlmConfig): void {
  if (!config.configured) {
    throw new LlmError('LLM_NOT_CONFIGURED', '未配置 DEEPSEEK_API_KEY，无法调用模型')
  }
}

export function assertInputSize(config: LlmConfig, messages: readonly ChatMessage[]): void {
  const total = messages.reduce((sum, message) => sum + message.content.length, 0)
  if (total > config.maxInputChars) {
    throw new LlmError(
      'LLM_BAD_INPUT',
      `输入过长：${total} 字符，上限 ${config.maxInputChars} 字符`,
    )
  }
}

export function buildBody(
  config: LlmConfig,
  request: ChatRequest,
  extra: { stream?: boolean } = {},
): string {
  const maxTokens = request.maxTokens ?? config.maxTokens
  const payload: Record<string, unknown> = {
    model: config.model,
    messages: request.messages,
    max_tokens: maxTokens,
  }
  if (request.temperature !== undefined) payload['temperature'] = request.temperature
  if (request.responseFormat !== undefined) {
    payload['response_format'] = { type: request.responseFormat }
  }
  if (extra.stream === true) payload['stream'] = true
  return JSON.stringify(payload)
}

export function backoffDelay(attempt: number, random: () => number): number {
  const base = 500 * 2 ** (attempt - 1)
  return base + Math.floor(random() * 100)
}

function authHeaders(config: LlmConfig): Record<string, string> {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${config.apiKey ?? ''}`,
  }
}

/**
 * 发一次请求（含超时与取消）。返回 `Response`，由调用方决定怎么读；
 * 网络层错误统一折成 `LLM_TIMEOUT` / `LLM_UPSTREAM`。
 */
export async function sendRequest(
  config: LlmConfig,
  body: string,
  request: { signal?: AbortSignal },
  deps: LlmDeps,
): Promise<Response> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, config.timeoutMs)

  const onAbort = (): void => controller.abort()
  request.signal?.addEventListener('abort', onAbort, { once: true })
  if (request.signal?.aborted === true) controller.abort()

  try {
    return await deps.fetch(chatEndpoint(config), {
      method: 'POST',
      headers: authHeaders(config),
      body,
      signal: controller.signal,
    })
  } catch {
    if (timedOut) {
      throw new LlmError('LLM_TIMEOUT', `模型调用超时（${config.timeoutMs}ms）`)
    }
    if (request.signal?.aborted === true) {
      throw new LlmError('LLM_TIMEOUT', '模型调用已取消')
    }
    throw new LlmError('LLM_UPSTREAM', '无法连接模型服务')
  } finally {
    clearTimeout(timer)
    request.signal?.removeEventListener('abort', onAbort)
  }
}

/** 上游状态码 → 我方错误；只为「非 2xx」返回错误 */
export function statusError(status: number): LlmError | undefined {
  if (status === 401 || status === 403) {
    return new LlmError('LLM_AUTH', '模型服务拒绝了凭据（请检查 DEEPSEEK_API_KEY）')
  }
  if (status === 429) return new LlmError('LLM_RATE_LIMIT', '模型服务限流（稍后再试）')
  if (status >= 500) return new LlmError('LLM_UPSTREAM', `模型服务错误（${status}）`)
  if (status >= 400) return new LlmError('LLM_UPSTREAM', `模型服务返回 ${status}`)
  return undefined
}

export function isRetryable(error: LlmError): boolean {
  return error.code === 'LLM_UPSTREAM' || error.code === 'LLM_RATE_LIMIT'
}

export function toLlmError(error: unknown): LlmError {
  if (error instanceof LlmError) return error
  return new LlmError('LLM_UPSTREAM', error instanceof Error ? error.message : String(error))
}

function firstChoice(payload: unknown): { content: string; model: string; usage: ChatUsage } {
  if (typeof payload !== 'object' || payload === null) {
    throw new LlmError('LLM_BAD_RESPONSE', '模型返回的不是 JSON 对象')
  }
  const record = payload as Record<string, unknown>
  const choices = record['choices']
  const first = Array.isArray(choices) ? choices[0] : undefined
  if (typeof first !== 'object' || first === null) {
    throw new LlmError('LLM_BAD_RESPONSE', '模型返回缺少 choices')
  }
  const message = (first as Record<string, unknown>)['message']
  const content =
    typeof message === 'object' && message !== null
      ? (message as Record<string, unknown>)['content']
      : undefined
  if (typeof content !== 'string') {
    throw new LlmError('LLM_BAD_RESPONSE', '模型返回缺少 message.content')
  }

  const usageRaw = record['usage']
  const usage: ChatUsage = {}
  if (typeof usageRaw === 'object' && usageRaw !== null) {
    const usageRecord = usageRaw as Record<string, unknown>
    if (typeof usageRecord['prompt_tokens'] === 'number') {
      usage.promptTokens = usageRecord['prompt_tokens']
    }
    if (typeof usageRecord['completion_tokens'] === 'number') {
      usage.completionTokens = usageRecord['completion_tokens']
    }
  }

  const rawModel = record['model']
  const model = typeof rawModel === 'string' && rawModel !== '' ? rawModel : ''
  return { content, model, usage }
}

async function readBody(response: Response): Promise<ChatResult> {
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new LlmError('LLM_BAD_RESPONSE', '模型返回的不是合法 JSON')
  }
  const { content, model, usage } = firstChoice(payload)
  return { text: content, model, usage, durationMs: 0 }
}

/** 非流式对话。失败按 D4 映射；5xx/429/网络错误会重试，401/超时不重试。 */
export async function chat(
  config: LlmConfig,
  request: ChatRequest,
  partialDeps: Partial<LlmDeps> = {},
): Promise<ChatResult> {
  assertConfigured(config)
  assertInputSize(config, request.messages)

  const deps = resolveDeps(partialDeps)
  const started = deps.now()
  const body = buildBody(config, request)
  let attempt = 0

  try {
    for (;;) {
      try {
        const response = await sendRequest(config, body, request, deps)
        const error = statusError(response.status)
        if (error !== undefined) throw error
        const parsed = await readBody(response)
        const durationMs = deps.now() - started
        deps.recorder?.({ ok: true, usage: parsed.usage, durationMs })
        return { ...parsed, durationMs }
      } catch (cause) {
        const error = toLlmError(cause)
        if (!isRetryable(error) || attempt >= config.maxRetries) throw error
        attempt += 1
        await deps.sleep(backoffDelay(attempt, deps.random))
      }
    }
  } catch (cause) {
    const error = toLlmError(cause)
    deps.recorder?.({
      ok: false,
      durationMs: deps.now() - started,
      error: error.message,
    })
    throw error
  }
}
