import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { createGoal } from '../src/domain/goals.js'
import { completion, fakeFetch, jsonResponse } from './llm-fixtures.js'
import { createEmptyVault, removeDir } from './helpers.js'

const dirs: string[] = []

function setup() {
  const root = createEmptyVault()
  dirs.push(root)
  const goal = createGoal({ root, title: 'Key 设置测试' })
  return { root, goalId: goal.id }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDir(dir)
})

function appWith(root: string, fetchImpl: typeof fetch) {
  return createApp({
    vaultPath: root,
    env: {},
    llmDeps: { fetch: fetchImpl, sleep: async () => undefined },
  })
}

describe('API Key 设置接口', () => {
  it('GET 初始未配置；PUT 后回显掩码且不泄露明文', async () => {
    const { root } = setup()
    const app = appWith(root, fakeFetch(() => jsonResponse(completion('{}'))).fetch)

    const initial = (await (await app.request('/api/settings/keys')).json()) as {
      deepseek: { configured: boolean }
    }
    expect(initial.deepseek.configured).toBe(false)

    const put = await app.request('/api/settings/keys', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deepseek: 'sk-test-1234' }),
    })
    const body = (await put.json()) as { deepseek: { configured: boolean; mask?: string } }
    const text = JSON.stringify(body)

    expect(put.status).toBe(200)
    expect(body.deepseek.configured).toBe(true)
    expect(body.deepseek.mask).toBe('••••1234')
    expect(text).not.toContain('sk-test-1234')
  })

  it('PUT 清除：null 生效', async () => {
    const { root } = setup()
    const app = appWith(root, fakeFetch(() => jsonResponse(completion('{}'))).fetch)

    await app.request('/api/settings/keys', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tavily: 'tvly-12345678' }),
    })
    const cleared = await app.request('/api/settings/keys', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tavily: null }),
    })

    expect(((await cleared.json()) as { tavily: { configured: boolean } }).tavily.configured).toBe(
      false,
    )
  })

  it('页面保存的 key 真的会被模型调用使用', async () => {
    const { root } = setup()
    const { fetch, calls } = fakeFetch(() => jsonResponse(completion('pong')))
    const app = appWith(root, fetch)

    await app.request('/api/settings/keys', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deepseek: 'sk-test-1234' }),
    })
    const ping = await app.request('/api/llm/ping', { method: 'POST' })

    expect(ping.status).toBe(200)
    expect(calls).toHaveLength(1)
    expect(String(calls[0]?.init.headers && JSON.stringify(calls[0]?.init.headers))).toContain(
      'sk-test-1234',
    )
  })

  it('PUT 非法类型：400', async () => {
    const { root } = setup()
    const app = appWith(root, fakeFetch(() => jsonResponse(completion('{}'))).fetch)

    const response = await app.request('/api/settings/keys', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deepseek: 123 }),
    })

    expect(response.status).toBe(400)
  })
})
