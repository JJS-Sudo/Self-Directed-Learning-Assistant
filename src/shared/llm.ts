/** `POST /api/llm/ping` 的响应契约 —— **只有类型** */
export interface LlmPingResult {
  /** 是否配置了 DEEPSEEK_API_KEY */
  configured: boolean
  ok: boolean
  model?: string
  durationMs?: number
}
