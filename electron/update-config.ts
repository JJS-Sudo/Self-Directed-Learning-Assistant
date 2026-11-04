declare const __SDL_GITHUB_BASE__: string | undefined
declare const __SDL_GITEE_BASE__: string | undefined

/** 构建时注入的更新源基地址（例如 https://github.com/owner/repo/releases/download） */
export const GITHUB_UPDATE_BASE = typeof __SDL_GITHUB_BASE__ === 'string' ? __SDL_GITHUB_BASE__ : ''
export const GITEE_UPDATE_BASE = typeof __SDL_GITEE_BASE__ === 'string' ? __SDL_GITEE_BASE__ : ''

/**
 * generic 更新源：每个版本一个目录（`.../download/v1.1.0/`）。
 * 返回顺序即回退顺序：GitHub 优先，Gitee 其次。
 */
export function updateFeedUrls(version: string, githubBase: string, giteeBase: string): string[] {
  return [githubBase, giteeBase]
    .map((base) => base.trim().replace(/\/+$/, ''))
    .filter((base) => base !== '')
    .map((base) => `${base}/v${version}`)
}

/** 只比较数字段；远端带预发布后缀时按同版本处理（避免误报） */
export function isNewerVersion(current: string, remote: string): boolean {
  const parse = (value: string): number[] =>
    value
      .trim()
      .replace(/^v/i, '')
      .split('.')
      .map((part) => Number.parseInt(part, 10))
      .map((part) => (Number.isFinite(part) ? part : 0))

  const a = parse(current)
  const b = parse(remote)
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    const left = a[index] ?? 0
    const right = b[index] ?? 0
    if (right > left) return true
    if (right < left) return false
  }
  return false
}
