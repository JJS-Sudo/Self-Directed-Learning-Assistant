import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BASE_URL,
  DEFAULT_MAX_INPUT_CHARS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_MAX_TOKENS,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS,
  resolveLlmConfig,
} from '../src/llm/config.js'

describe('LLM 配置', () => {
  it('没有 key 时 configured 为 false，其余取默认值', () => {
    const config = resolveLlmConfig({})

    expect(config.configured).toBe(false)
    expect(config.apiKey).toBeUndefined()
    expect(config.baseUrl).toBe(DEFAULT_BASE_URL)
    expect(config.model).toBe(DEFAULT_MODEL)
    expect(config.timeoutMs).toBe(DEFAULT_TIMEOUT_MS)
    expect(config.maxRetries).toBe(DEFAULT_MAX_RETRIES)
    expect(config.maxTokens).toBe(DEFAULT_MAX_TOKENS)
    expect(config.maxInputChars).toBe(DEFAULT_MAX_INPUT_CHARS)
  })

  it('环境变量覆盖默认值', () => {
    const config = resolveLlmConfig({
      DEEPSEEK_API_KEY: 'sk-secret-value',
      SDL_LLM_BASE_URL: 'https://proxy.test/v1',
      SDL_LLM_MODEL: 'deepseek-reasoner',
      SDL_LLM_TIMEOUT_MS: '5000',
      SDL_LLM_MAX_RETRIES: '1',
      SDL_LLM_MAX_TOKENS: '512',
      SDL_LLM_MAX_INPUT_CHARS: '2000',
    })

    expect(config.configured).toBe(true)
    expect(config.baseUrl).toBe('https://proxy.test/v1')
    expect(config.model).toBe('deepseek-reasoner')
    expect(config.timeoutMs).toBe(5_000)
    expect(config.maxRetries).toBe(1)
    expect(config.maxTokens).toBe(512)
    expect(config.maxInputChars).toBe(2_000)
  })

  it('非法数字回落到默认值，而不是 NaN', () => {
    const config = resolveLlmConfig({ SDL_LLM_TIMEOUT_MS: 'abc', SDL_LLM_MAX_RETRIES: '-1' })

    expect(config.timeoutMs).toBe(DEFAULT_TIMEOUT_MS)
    expect(config.maxRetries).toBe(DEFAULT_MAX_RETRIES)
  })

  it('重试次数可以显式设为 0（关掉重试）', () => {
    expect(resolveLlmConfig({ SDL_LLM_MAX_RETRIES: '0' }).maxRetries).toBe(0)
  })

  it('String / JSON.stringify 都不带出密钥', () => {
    const config = resolveLlmConfig({ DEEPSEEK_API_KEY: 'sk-secret-value' })

    expect(String(config)).not.toContain('sk-secret-value')
    expect(JSON.stringify(config)).not.toContain('sk-secret-value')
    expect(config.apiKey).toBe('sk-secret-value')
  })
})
