import type { LlmPingResult } from '../shared/llm.js'
import { chat, type LlmDeps } from './client.js'
import type { LlmConfig } from './config.js'

/**
 * 一次极小的真实调用（`max_tokens: 1`），只用来验证凭据与可达性。
 * 未配置时**不发起任何请求**，直接返回 `configured:false`。
 */
export async function pingLlm(
  config: LlmConfig,
  partialDeps: Partial<LlmDeps> = {},
): Promise<LlmPingResult> {
  if (!config.configured) return { configured: false, ok: false }

  const result = await chat(
    config,
    {
      messages: [{ role: 'user', content: '回复一个字：好' }],
      maxTokens: 1,
    },
    partialDeps,
  )

  return {
    configured: true,
    ok: true,
    model: result.model === '' ? config.model : result.model,
    durationMs: result.durationMs,
  }
}
