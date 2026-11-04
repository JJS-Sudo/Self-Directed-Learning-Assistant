import type { ContentfulStatusCode } from 'hono/utils/http-status'

/** 领域错误的稳定错误码：对外表现为 `{ error: { code, message } }` */
export type VaultErrorCode =
  | 'INVALID_INPUT'
  | 'PATH_OUTSIDE_VAULT'
  | 'VAULT_MISSING'
  | 'MARKER_MISSING'
  | 'NOT_FOUND'
  | 'CONFLICT'

export class VaultError extends Error {
  readonly code: VaultErrorCode

  constructor(code: VaultErrorCode, message: string) {
    super(message)
    this.name = 'VaultError'
    this.code = code
  }
}

/** 错误码 → HTTP 状态码的唯一出处 */
export const HTTP_STATUS: Record<VaultErrorCode, ContentfulStatusCode> = {
  INVALID_INPUT: 400,
  PATH_OUTSIDE_VAULT: 400,
  NOT_FOUND: 404,
  VAULT_MISSING: 409,
  MARKER_MISSING: 409,
  CONFLICT: 409,
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function toErrorBody(error: unknown): { code: string; message: string } {
  if (error instanceof VaultError) return { code: error.code, message: error.message }
  return { code: 'INTERNAL', message: messageOf(error) }
}
