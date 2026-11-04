import type { ContentfulStatusCode } from 'hono/utils/http-status'

/** LLM 相关错误的稳定错误码：对外只露 code 与一句话，不露上游细节 */
export type LlmErrorCode =
  | 'LLM_NOT_CONFIGURED'
  | 'LLM_BAD_INPUT'
  | 'LLM_AUTH'
  | 'LLM_RATE_LIMIT'
  | 'LLM_UPSTREAM'
  | 'LLM_TIMEOUT'
  | 'LLM_BAD_RESPONSE'

export class LlmError extends Error {
  readonly code: LlmErrorCode
  /** 结构校验失败时的字段路径（只含我们自己 schema 的路径） */
  readonly details: readonly string[]

  constructor(code: LlmErrorCode, message: string, details: readonly string[] = []) {
    super(message)
    this.name = 'LlmError'
    this.code = code
    this.details = details
  }
}

export const LLM_HTTP_STATUS: Record<LlmErrorCode, ContentfulStatusCode> = {
  LLM_NOT_CONFIGURED: 503,
  LLM_BAD_INPUT: 400,
  LLM_AUTH: 502,
  LLM_RATE_LIMIT: 429,
  LLM_UPSTREAM: 502,
  LLM_TIMEOUT: 504,
  LLM_BAD_RESPONSE: 422,
}

/** 兜底脱敏：任何形如 `sk-xxxx` 的串都不许出现在对外消息或日志里 */
export function redactSecrets(text: string): string {
  return text.replace(/sk-[A-Za-z0-9_-]{6,}/g, '[redacted]')
}

export function toLlmErrorBody(error: unknown): { code: string; message: string } {
  if (error instanceof LlmError) {
    const suffix = error.details.length === 0 ? '' : `（字段：${error.details.join('、')}）`
    return { code: error.code, message: redactSecrets(`${error.message}${suffix}`) }
  }
  return {
    code: 'INTERNAL',
    message: redactSecrets(error instanceof Error ? error.message : String(error)),
  }
}
