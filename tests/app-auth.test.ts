import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { expectedCookieValue } from '../src/server/auth.js'
import { createEmptyVault, removeDir } from './helpers.js'

const dirs: string[] = []

function setup(accessToken?: string) {
  const root = createEmptyVault()
  dirs.push(root)
  const app = createApp({
    vaultPath: root,
    ...(accessToken === undefined ? {} : { accessToken, sessionSecret: 'salt' }),
  })
  return app
}

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDir(dir)
})

describe('访问控制', () => {
  it('未设置 token：不启用登录（旧行为不变）', async () => {
    const app = setup()

    const response = await app.request('/api/goals')
    expect(response.status).toBe(200)
  })

  it('设了 token：页面 302 到 /login，API 返回 401', async () => {
    const app = setup('secret')

    const page = await app.request('/')
    expect(page.status).toBe(302)
    expect(page.headers.get('location')).toBe('/login')

    const api = await app.request('/api/goals')
    expect(api.status).toBe(401)
    expect(((await api.json()) as { error: { code: string } }).error.code).toBe('UNAUTHORIZED')
  })

  it('免验白名单：/login、/healthz、/api/health', async () => {
    const app = setup('secret')

    expect((await app.request('/login')).status).toBe(200)
    expect((await app.request('/healthz')).status).toBe(200)
    expect((await app.request('/api/health')).status).toBe(200)
  })

  it('登录：错误令牌 401，正确令牌写 cookie 后放行', async () => {
    const app = setup('secret')

    const bad = await app.request('/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'token=wrong',
    })
    expect(bad.status).toBe(401)

    const good = await app.request('/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'token=secret',
    })
    expect(good.status).toBe(302)
    expect(good.headers.get('set-cookie')).toContain('sdl_auth=')

    const cookie = `sdl_auth=${expectedCookieValue('secret', 'salt')}`
    const page = await app.request('/', { headers: { cookie } })
    expect(page.status).toBe(200)
  })

  it('Bearer 原文令牌也能访问 API', async () => {
    const app = setup('secret')

    const response = await app.request('/api/goals', {
      headers: { authorization: 'Bearer secret' },
    })
    expect(response.status).toBe(200)
  })

  it('登出清除 cookie 并回登录页', async () => {
    const app = setup('secret')

    const response = await app.request('/logout', { method: 'POST' })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/login')
  })
})
