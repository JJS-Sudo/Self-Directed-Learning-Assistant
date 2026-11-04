export const DEFAULT_BASE_URL = 'https://api.deepseek.com'
export const DEFAULT_MODEL = 'deepseek-chat'
export const DEFAULT_TIMEOUT_MS = 120_000
export const DEFAULT_MAX_RETRIES = 3
export const DEFAULT_MAX_TOKENS = 16_000
export const DEFAULT_MAX_INPUT_CHARS = 100_000

/**
 * 模型配置。`apiKey` 用私有字段 + getter：
 * `String(config)` 与 `JSON.stringify(config)` 都不会带出密钥。
 */
export class LlmConfig {
  readonly configured: boolean
  readonly baseUrl: string
  readonly model: string
  readonly timeoutMs: number
  readonly maxRetries: number
  readonly maxTokens: number
  readonly maxInputChars: number
  readonly #apiKey: string | undefined

  constructor(input: {
    apiKey?: string
    baseUrl: string
    model: string
    timeoutMs: number
    maxRetries: number
    maxTokens: number
    maxInputChars: number
  }) {
    this.#apiKey = input.apiKey
    this.configured = input.apiKey !== undefined && input.apiKey !== ''
    this.baseUrl = input.baseUrl
    this.model = input.model
    this.timeoutMs = input.timeoutMs
    this.maxRetries = input.maxRetries
    this.maxTokens = input.maxTokens
    this.maxInputChars = input.maxInputChars
  }

  get apiKey(): string | undefined {
    return this.#apiKey
  }
}

function text(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function int(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = text(env, key)
  if (raw === undefined) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

/** 重试次数允许为 0（关掉重试），其余数值项不允许 */
function retries(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = text(env, key)
  if (raw === undefined) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback
}

export function resolveLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig {
  return new LlmConfig({
    apiKey: text(env, 'DEEPSEEK_API_KEY'),
    baseUrl: text(env, 'SDL_LLM_BASE_URL') ?? DEFAULT_BASE_URL,
    model: text(env, 'SDL_LLM_MODEL') ?? DEFAULT_MODEL,
    timeoutMs: int(env, 'SDL_LLM_TIMEOUT_MS', DEFAULT_TIMEOUT_MS),
    maxRetries: retries(env, 'SDL_LLM_MAX_RETRIES', DEFAULT_MAX_RETRIES),
    maxTokens: int(env, 'SDL_LLM_MAX_TOKENS', DEFAULT_MAX_TOKENS),
    maxInputChars: int(env, 'SDL_LLM_MAX_INPUT_CHARS', DEFAULT_MAX_INPUT_CHARS),
  })
}
