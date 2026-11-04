import { describe, expect, it } from 'vitest'
import { resolveHost } from '../src/server/host-guard.js'

describe('监听地址判定', () => {
  it('默认 127.0.0.1，且不强制登录', () => {
    const decision = resolveHost({})
    expect(decision).toMatchObject({ host: '127.0.0.1', requiresAuth: false })
    expect(decision.error).toBeUndefined()
  })

  it('本地地址 + token：启用登录', () => {
    const decision = resolveHost({ HOST: 'localhost', SDL_ACCESS_TOKEN: 't' })
    expect(decision.requiresAuth).toBe(true)
    expect(decision.error).toBeUndefined()
  })

  it('::1 视为本地', () => {
    expect(resolveHost({ HOST: '::1' })).toMatchObject({ host: '::1', requiresAuth: false })
  })

  it('对外监听但没有 token：拒绝启动并给指引', () => {
    const decision = resolveHost({ HOST: '0.0.0.0' })

    expect(decision.requiresAuth).toBe(true)
    expect(decision.error).toContain('拒绝启动')
    expect(decision.error).toContain('SDL_ACCESS_TOKEN')
    expect(decision.error).toContain('set SDL_ACCESS_TOKEN')
  })

  it('对外监听 + token：允许启动', () => {
    const decision = resolveHost({ HOST: '0.0.0.0', SDL_ACCESS_TOKEN: 'long-secret' })

    expect(decision).toMatchObject({ host: '0.0.0.0', requiresAuth: true })
    expect(decision.error).toBeUndefined()
  })

  it('显式声明在反向代理/端口映射后面：允许 0.0.0.0 无 token', () => {
    const decision = resolveHost({ HOST: '0.0.0.0', SDL_BEHIND_PROXY: '1' })

    expect(decision).toMatchObject({ host: '0.0.0.0', requiresAuth: false })
    expect(decision.error).toBeUndefined()
  })

  it('空字符串的 HOST 退回默认值', () => {
    expect(resolveHost({ HOST: '   ' }).host).toBe('127.0.0.1')
  })
})
