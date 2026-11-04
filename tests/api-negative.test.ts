import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { createGoal } from '../src/domain/goals.js'
import { completion, fakeFetch, jsonResponse } from './llm-fixtures.js'
import { createEmptyVault, removeDir } from './helpers.js'

const dirs: string[] = []

function setup(env: NodeJS.ProcessEnv = {}, fetchImpl?: typeof fetch) {
  const root = createEmptyVault()
  dirs.push(root)
  const goal = createGoal({ root, title: '负路径测试' })
  const app = createApp({
    vaultPath: root,
    env,
    ...(fetchImpl === undefined
      ? {}
      : { llmDeps: { fetch: fetchImpl, sleep: async () => undefined } }),
  })
  return { root, goalId: goal.id, app }
}

function postJson(app: ReturnType<typeof createApp>, path: string, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDir(dir)
})

describe('API 的负路径', () => {
  it('标题超过 200 字：400', async () => {
    const { app } = setup()
    const response = await postJson(app, '/api/goals', { title: 'x'.repeat(201) })

    expect(response.status).toBe(400)
  })

  it('材料超过 200000 字符：400，且不调用模型', async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse(completion('{}')))
    const { app, goalId } = setup({ DEEPSEEK_API_KEY: 'sk-test-key' }, fetch)

    const response = await postJson(app, `/api/goals/${goalId}/map/preview`, {
      material: 'x'.repeat(200_001),
    })

    expect(response.status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('请求体不是 JSON：400', async () => {
    const { app, goalId } = setup()
    const response = await app.request(`/api/goals/${goalId}/map/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    })

    expect(response.status).toBe(400)
  })

  it('candidates 里有空标题：400', async () => {
    const { app, goalId } = setup()
    const response = await postJson(app, `/api/goals/${goalId}/map/commit`, {
      candidates: [{ tempId: 'a', title: '   ' }],
    })

    expect(response.status).toBe(400)
  })

  it('ping 超时：504 LLM_TIMEOUT，而不是 500', async () => {
    const hangingFetch = ((_input: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal
        signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        )
      })) as typeof fetch

    const { app } = setup(
      { DEEPSEEK_API_KEY: 'sk-test-key', SDL_LLM_TIMEOUT_MS: '5' },
      hangingFetch,
    )

    const response = await app.request('/api/llm/ping', { method: 'POST' })

    expect(response.status).toBe(504)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe('LLM_TIMEOUT')
  })
})
