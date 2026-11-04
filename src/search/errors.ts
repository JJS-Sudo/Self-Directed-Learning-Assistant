export type SearchErrorCode =
  | 'SEARCH_NOT_CONFIGURED'
  | 'SEARCH_AUTH'
  | 'SEARCH_RATE_LIMIT'
  | 'SEARCH_UPSTREAM'
  | 'SEARCH_TIMEOUT'
  | 'SEARCH_BAD_RESPONSE'

export const SEARCH_HTTP_STATUS: Record<SearchErrorCode, 429 | 502 | 503 | 504> = {
  SEARCH_NOT_CONFIGURED: 503,
  SEARCH_AUTH: 502,
  SEARCH_RATE_LIMIT: 429,
  SEARCH_UPSTREAM: 502,
  SEARCH_TIMEOUT: 504,
  SEARCH_BAD_RESPONSE: 502,
}

export class SearchError extends Error {
  readonly code: SearchErrorCode

  constructor(code: SearchErrorCode, message: string) {
    super(message)
    this.name = 'SearchError'
    this.code = code
  }
}

export function toSearchErrorBody(error: unknown): {
  code: string
  message: string
} {
  if (error instanceof SearchError) {
    return { code: error.code, message: error.message }
  }
  return { code: 'SEARCH_UPSTREAM', message: '搜索失败' }
}
