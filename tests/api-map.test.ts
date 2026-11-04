import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { createGoal } from '../src/domain/goals.js'
import { listNodes } from '../src/domain/nodes.js'
import type { MapNodeDto } from '../src/shared/map.js'
import { completion, fakeFetch, jsonResponse } from './llm-fixtures.js'
import { createEmptyVault, removeDir } from './helpers.js'

const dirs: string[] = []

function setup(env: NodeJS.ProcessEnv = {}, fetchImpl?: typeof fetch) {
  const root = createEmptyVault()
  dirs.push(root)
  const goal = createGoal({ root, title: '测试目标' })
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

describe('知识地图 API', () => {
  it('estimate 只做本地估算：不调用模型，返回块数与费用', async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse(completion('{}')))
    const { app, goalId } = setup({}, fetch)
    const material = Array.from({ length: 100 }, (_, index) => `第 ${index + 1} 节`).join('\n')

    const response = await postJson(app, `/api/goals/${goalId}/map/estimate`, { material })
    const body = (await response.json()) as { chunks: number; inputTokens: number; costCny: number }

    expect(response.status).toBe(200)
    expect(body.chunks).toBe(13)
    expect(body.inputTokens).toBeGreaterThan(0)
    expect(body.costCny).toBeGreaterThan(0)
    expect(calls).toHaveLength(0)
  })

  it('estimate 材料为空时 400', async () => {
    const { app, goalId } = setup()
    const response = await postJson(app, `/api/goals/${goalId}/map/estimate`, { material: '  ' })

    expect(response.status).toBe(400)
  })

  it('未配置 key：preview 返回 503 且不发请求、不写盘', async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse(completion('{}')))
    const { root, app, goalId } = setup({}, fetch)

    const response = await postJson(app, `/api/goals/${goalId}/map/preview`, { material: '第一章' })
    const body = (await response.json()) as { error: { code: string } }

    expect(response.status).toBe(503)
    expect(body.error.code).toBe('LLM_NOT_CONFIGURED')
    expect(calls).toHaveLength(0)
    expect(listNodes(root, goalId)).toHaveLength(0)
  })

  it('preview 返回候选但不落盘', async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse(
        completion(
          '{"nodes":[{"temp_id":"n1","title":"第一章"},{"temp_id":"n2","title":"1.1 小节","parent_temp_id":"n1"}]}',
        ),
      ),
    )
    const { root, app, goalId } = setup({ DEEPSEEK_API_KEY: 'sk-test-key' }, fetch)

    const response = await postJson(app, `/api/goals/${goalId}/map/preview`, {
      material: '第一章\n1.1 小节',
    })
    const body = (await response.json()) as { candidates: { title: string }[]; estimate: unknown }

    expect(response.status).toBe(200)
    expect(body.candidates.map((item) => item.title)).toEqual(['第一章', '1.1 小节'])
    expect((body as { estimate?: unknown }).estimate).toBeTruthy()
    expect(listNodes(root, goalId)).toHaveLength(0)
  })

  it('commit 落盘后 GET 能读到节点与覆盖警告', async () => {
    const { root, app, goalId } = setup()

    const commit = await postJson(app, `/api/goals/${goalId}/map/commit`, {
      candidates: [
        { tempId: 'a', title: '第一章' },
        { tempId: 'b', title: '1.1 小节', parentTempId: 'a' },
      ],
    })
    const commitBody = (await commit.json()) as { created: number; warnings: string[] }

    expect(commit.status).toBe(200)
    expect(commitBody.created).toBe(2)
    expect(commitBody.warnings.some((warning) => warning.includes('没有被任何路径段覆盖'))).toBe(
      true,
    )

    const map = await app.request(`/api/goals/${goalId}/map`)
    const mapBody = (await map.json()) as { nodes: MapNodeDto[]; warnings: string[] }

    expect(mapBody.nodes).toHaveLength(2)
    expect(mapBody.nodes.find((node) => node.title === '1.1 小节')?.upId).toBeTruthy()
    expect(listNodes(root, goalId)).toHaveLength(2)
  })

  it('目标不存在时四个接口都是 404', async () => {
    const { app } = setup()

    const estimate = await postJson(app, '/api/goals/zzzzzz/map/estimate', { material: 'x' })
    const preview = await postJson(app, '/api/goals/zzzzzz/map/preview', { material: 'x' })
    const commit = await postJson(app, '/api/goals/zzzzzz/map/commit', {
      candidates: [{ tempId: 'a', title: 'x' }],
    })
    const map = await app.request('/api/goals/zzzzzz/map')

    for (const response of [estimate, preview, commit, map]) {
      expect(response.status).toBe(404)
    }
  })

  it('commit 没有候选时 400', async () => {
    const { app, goalId } = setup()
    const response = await postJson(app, `/api/goals/${goalId}/map/commit`, { candidates: [] })

    expect(response.status).toBe(400)
  })
})
