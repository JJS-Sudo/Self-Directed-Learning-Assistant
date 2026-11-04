import { createHash, timingSafeEqual } from 'node:crypto'
import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, setCookie } from 'hono/cookie'

export const AUTH_COOKIE = 'sdl_auth'
export const LOGIN_PATH = '/login'

const PUBLIC_PATHS = new Set(['/login', '/healthz', '/api/health', '/favicon.ico'])

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

/** cookie 里存的是派生值，绝不是 token 原文 */
export function expectedCookieValue(token: string, secret = ''): string {
  return createHash('sha256').update(`${secret}:${token}`).digest('hex')
}

/** 常量时间比较：两边都先 sha256，避免长度差异泄露 */
export function tokensMatch(submitted: string, expected: string): boolean {
  return timingSafeEqual(digest(submitted), digest(expected))
}

function cookieValue(header: string | null, name: string): string | undefined {
  if (header === null) return undefined
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=')
  }
  return undefined
}

export function isAuthorized(options: {
  token: string
  secret?: string
  cookieHeader: string | null
  bearer?: string
}): boolean {
  const cookie = cookieValue(options.cookieHeader ?? null, AUTH_COOKIE)
  if (cookie !== undefined && cookie !== '') {
    return tokensMatch(cookie, expectedCookieValue(options.token, options.secret ?? ''))
  }
  if (options.bearer !== undefined && options.bearer !== '') {
    // Bearer 直接收原文 token，方便 curl / 脚本
    return tokensMatch(options.bearer, options.token)
  }
  return false
}

export function authMiddleware(token: string, secret = ''): MiddlewareHandler {
  return async (c, next) => {
    if (PUBLIC_PATHS.has(c.req.path)) return next()

    const bearer = c.req.header('authorization')?.replace(/^Bearer\s+/i, '')
    if (
      isAuthorized({
        token,
        secret,
        cookieHeader: c.req.header('cookie') ?? null,
        ...(bearer === undefined ? {} : { bearer }),
      })
    ) {
      return next()
    }

    if (c.req.path.startsWith('/api/')) {
      return c.json(
        { error: { code: 'UNAUTHORIZED', message: '需要登录：先访问 /login 获取访问 cookie' } },
        401,
      )
    }
    return c.redirect(LOGIN_PATH)
  }
}

export function renderLoginPage(error?: string): string {
  const message =
    error === undefined ? '' : `<p class="error" role="alert">${error.replaceAll('<', '&lt;')}</p>`
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>登录 · 自我导向学习辅助器</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #faf9f6; color: #2b2a26; margin: 0; }
    main { max-width: 24rem; margin: 12vh auto; padding: 1.5rem; background: #fff; border: 1px solid #e6e3dc; border-radius: 12px; }
    h1 { font-size: 1.1rem; margin: 0 0 .4rem; }
    p { font-size: .85rem; color: #6f6b62; line-height: 1.5; }
    input { width: 100%; box-sizing: border-box; padding: .55rem .7rem; margin: .8rem 0; border: 1px solid #d8d4ca; border-radius: 8px; font: inherit; }
    button { width: 100%; padding: .55rem .7rem; border: 0; border-radius: 8px; background: #3b3a35; color: #fff; font: inherit; cursor: pointer; }
    .error { color: #b4342a; }
  </style>
</head>
<body>
  <main>
    <h1>访问令牌</h1>
    <p>这个服务对外监听，需要输入 SDL_ACCESS_TOKEN 才能进入。</p>
    ${message}
    <form method="post" action="/login">
      <input type="password" name="token" aria-label="访问令牌" autofocus required />
      <button type="submit">进入</button>
    </form>
  </main>
</body>
</html>`
}

export function loginRedirect(c: Context): Response {
  return c.redirect(LOGIN_PATH)
}

export function setAuthCookie(c: Context, token: string, secret = ''): void {
  setCookie(c, AUTH_COOKIE, expectedCookieValue(token, secret), {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
}

export function clearAuthCookie(c: Context): void {
  deleteCookie(c, AUTH_COOKIE, { path: '/' })
}
