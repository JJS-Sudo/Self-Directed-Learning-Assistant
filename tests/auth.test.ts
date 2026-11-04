import { describe, expect, it } from 'vitest'
import { AUTH_COOKIE, expectedCookieValue, isAuthorized, tokensMatch } from '../src/server/auth.js'

describe('令牌派生与比较', () => {
  it('cookie 值是 64 位十六进制，不含 token 原文', () => {
    const value = expectedCookieValue('super-secret-token', 'salt')

    expect(value).toMatch(/^[0-9a-f]{64}$/)
    expect(value).not.toContain('super-secret-token')
  })

  it('盐不同，派生值不同', () => {
    expect(expectedCookieValue('t', 'a')).not.toBe(expectedCookieValue('t', 'b'))
  })

  it('常量时间比较：相等为真，差一字符为假', () => {
    expect(tokensMatch('abc', 'abc')).toBe(true)
    expect(tokensMatch('abc', 'abd')).toBe(false)
    expect(tokensMatch('abc', 'abcd')).toBe(false)
  })
})

describe('请求是否已认证', () => {
  const token = 'the-token'
  const secret = 'salt'
  const cookie = `${AUTH_COOKIE}=${expectedCookieValue(token, secret)}`

  it('带正确 cookie：通过', () => {
    expect(isAuthorized({ token, secret, cookieHeader: cookie })).toBe(true)
  })

  it('cookie 错：不通过', () => {
    expect(isAuthorized({ token, secret, cookieHeader: `${AUTH_COOKIE}=deadbeef` })).toBe(false)
  })

  it('Bearer 直接收原文 token：通过', () => {
    expect(isAuthorized({ token, secret, cookieHeader: null, bearer: token })).toBe(true)
    expect(isAuthorized({ token, secret, cookieHeader: null, bearer: 'wrong' })).toBe(false)
  })

  it('什么都没有：不通过', () => {
    expect(isAuthorized({ token, secret, cookieHeader: null })).toBe(false)
  })
})
