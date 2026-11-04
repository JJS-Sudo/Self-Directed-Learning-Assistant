import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { createGoal } from '../src/domain/goals.js'
import { createNode } from '../src/domain/nodes.js'
import { listResources } from '../src/domain/resources.js'
import { completion, jsonResponse } from './llm-fixtures.js'
import { createEmptyVault, removeDir } from './helpers.js'

const dirs: string[] = []

interface SetupOptions {
  env?: NodeJS.ProcessEnv
  searchResults?: (query: string) => { title: string; url: string; content: string }[]
  metadataItems?: (urls: string[]) => unknown[]
}

function setup(options: SetupOptions = {}) {
  const root = createEmptyVault()
  dirs.push(root)
  const goal = createGoal({ root, title: '资源 API 测试' })
  const a = createNode({ root, title: '最小二乘估计', goal: goal.id })
  const b = createNode({ root, title: '高斯-马尔可夫定理', goal: goal.id })

  const searchCalls: string[] = []
  const searchFetch = (async (_input: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { query: string }
    searchCalls.push(body.query)
    const results = options.searchResults?.(body.query) ?? []
    return new Response(JSON.stringify({ results }), { status: 200 })
  }) as typeof fetch

  const llmFetch = (async () => {
    const items = options.metadataItems?.([]) ?? []
    return jsonResponse(completion(JSON.stringify({ items })))
  }) as unknown as typeof fetch

  const app = createApp({
    vaultPath: root,
    env: {
      TAVILY_API_KEY: 'tvly-test',
      DEEPSEEK_API_KEY: 'sk-test',
      ...options.env,
    },
    searchDeps: { fetch: searchFetch },
    llmDeps: { fetch: llmFetch, sleep: async () => undefined },
  })

  return { root, goalId: goal.id, nodes: { a, b }, app, searchCalls }
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

describe('资源 API', () => {
  it('preview 返回候选但不落盘', async () => {
    const { root, goalId, nodes, app } = setup({
      searchResults: (query) =>
        query.includes('最小二乘估计')
          ? [
              { title: '视频一', url: 'https://v.test/1', content: '讲最小二乘' },
              { title: '文章一', url: 'https://a.test/1', content: '文字讲解' },
            ]
          : [],
      metadataItems: () => [
        { url: 'https://v.test/1', level: '入门', media: '视频', duration_min: 18 },
        { url: 'https://a.test/1', level: '进阶', media: '文字' },
      ],
    })

    const response = await postJson(app, `/api/goals/${goalId}/resources/preview`, {
      nodeIds: [nodes.a.id],
    })
    const body = (await response.json()) as {
      candidates: { url: string; level?: string; media?: string; durationMin?: number }[]
      perNode: { found: number }[]
      warnings: string[]
    }

    expect(response.status).toBe(200)
    expect(body.perNode[0]?.found).toBe(2)
    expect(body.candidates[0]).toMatchObject({
      url: 'https://v.test/1',
      level: '入门',
      media: '视频',
      durationMin: 18,
    })
    expect(body.warnings).toEqual([])
    expect(listResources(root, { nodeIds: [nodes.a.id] })).toHaveLength(0)
  })

  it('缺 Tavily key：503 SEARCH_NOT_CONFIGURED，且 0 次搜索', async () => {
    const { app, goalId, nodes, searchCalls } = setup({ env: { TAVILY_API_KEY: '' } })

    const response = await postJson(app, `/api/goals/${goalId}/resources/preview`, {
      nodeIds: [nodes.a.id],
    })

    expect(response.status).toBe(503)
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'SEARCH_NOT_CONFIGURED',
    )
    expect(searchCalls).toHaveLength(0)
  })

  it('缺模型 key：503 LLM_NOT_CONFIGURED，且 0 次搜索', async () => {
    const { app, goalId, nodes, searchCalls } = setup({ env: { DEEPSEEK_API_KEY: '' } })

    const response = await postJson(app, `/api/goals/${goalId}/resources/preview`, {
      nodeIds: [nodes.a.id],
    })

    expect(response.status).toBe(503)
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'LLM_NOT_CONFIGURED',
    )
    expect(searchCalls).toHaveLength(0)
  })

  it('节点数超过 5 或不属于该目标：400', async () => {
    const { app, goalId } = setup()

    const tooMany = await postJson(app, `/api/goals/${goalId}/resources/preview`, {
      nodeIds: ['a', 'b', 'c', 'd', 'e', 'f'],
    })
    const unknown = await postJson(app, `/api/goals/${goalId}/resources/preview`, {
      nodeIds: ['zzzzzz'],
    })

    expect(tooMany.status).toBe(400)
    expect(unknown.status).toBe(400)
  })

  it('commit 落盘后 GET 返回实时理由与分数', async () => {
    const { root, goalId, nodes, app } = setup()

    const commit = await postJson(app, `/api/goals/${goalId}/resources/commit`, {
      resources: [
        {
          nodeId: nodes.a.id,
          title: '最小二乘 B 站视频',
          url: 'https://v.test/1',
          level: '入门',
          media: '视频',
          durationMin: 18,
        },
      ],
    })
    expect(commit.status).toBe(200)
    expect(((await commit.json()) as { created: number }).created).toBe(1)
    expect(listResources(root)).toHaveLength(1)

    const get = await app.request(`/api/goals/${goalId}/resources`)
    const body = (await get.json()) as {
      resources: { score: number; rankReason: string; nodeTitle?: string }[]
      profile: { mediaPreference: string }
    }

    expect(body.resources).toHaveLength(1)
    expect(typeof body.resources[0]?.score).toBe('number')
    expect(body.resources[0]?.rankReason.length ?? 0).toBeGreaterThan(0)
    expect(body.resources[0]?.nodeTitle).toBe('最小二乘估计')
    expect(body.profile.mediaPreference).toBeDefined()
  })

  it('重复 URL 关联到新节点，不新建文件', async () => {
    const { root, goalId, nodes, app } = setup()
    const item = {
      nodeId: nodes.a.id,
      title: '最小二乘 B 站视频',
      url: 'https://v.test/1',
      level: '入门',
      media: '视频',
    }

    await postJson(app, `/api/goals/${goalId}/resources/commit`, { resources: [item] })
    const again = await postJson(app, `/api/goals/${goalId}/resources/commit`, {
      resources: [{ ...item, nodeId: nodes.b.id, title: '换个节点' }],
    })

    const body = (await again.json()) as {
      created: number
      linked: number
      skipped: { url: string; reason: string }[]
    }
    expect(body.created).toBe(0)
    expect(body.linked).toBe(1)
    expect(body.skipped).toHaveLength(0)
    const resources = listResources(root)
    expect(resources).toHaveLength(1)
    expect(resources[0]?.nodeIds).toEqual([nodes.a.id, nodes.b.id])
  })

  it('等级不在词表：400', async () => {
    const { app, goalId, nodes } = setup()

    const response = await postJson(app, `/api/goals/${goalId}/resources/commit`, {
      resources: [
        {
          nodeId: nodes.a.id,
          title: 'x',
          url: 'https://x.test/1',
          level: '高级',
          media: '视频',
        },
      ],
    })

    expect(response.status).toBe(400)
  })

  it('目标不存在：三个接口都 404', async () => {
    const { app } = setup()

    const responses = [
      await postJson(app, '/api/goals/zzzzzz/resources/preview', { nodeIds: ['a'] }),
      await postJson(app, '/api/goals/zzzzzz/resources/commit', { resources: [] }),
      await app.request('/api/goals/zzzzzz/resources'),
    ]

    for (const response of responses) expect(response.status).toBe(404)
  })
})
