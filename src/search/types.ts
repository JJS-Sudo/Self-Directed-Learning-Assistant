export interface SearchHit {
  title: string
  url: string
  snippet: string
}

export interface SearchOptions {
  /** 最多返回几条，默认 5 */
  maxResults?: number
}

export interface SearchProvider {
  search(query: string, options?: SearchOptions): Promise<SearchHit[]>
}
