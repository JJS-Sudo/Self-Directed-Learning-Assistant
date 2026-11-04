import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { createGoal } from '../src/domain/goals.js'
import { createNode } from '../src/domain/nodes.js'
import { createStage } from '../src/domain/path-stages.js'
import { createResource, listResources } from '../src/domain/resources.js'
import { completion, jsonResponse } from './llm-fixtures.js'
import { createEmptyVault, removeDir } from './helpers.js'

const dirs: string[] = []

interface SetupOptions {
  withTavily?: boolean
  count?: number
  hits?: (query: string) => { title: string; url: string; content: string }[]
}

function setup(options: SetupOptions = {}) {
  const root = createEmptyVault()
  dirs.push(root)
  const goal = createGoal({ root, title: '自动资源 API' })
  const nodes = Array.from({ length: options.count ?? 2 }, (_, index) =>
    createNode({ root, title: `节点 ${index + 1}`, goal: goal.id }),
  )
  createStage({
    root,
    goal: goal.id,
    title: '第一阶段',
    estimate: '约 1 天',
    nodes: nodes.map((node) => node.id),
    checks: ['能独立复述该知识点并给出一个例子'],
  })

  let searchCalls = 0
  const searchFetch = (async (_input: unknown, init?: RequestInit) => {
    searchCalls += 1
    const body = JSON.parse(String(init?.body)) as { query: string }
    const results = options.hits?.(body.query) ?? []
    return new Response(JSON.stringify({ results }), { status: 200 })
  }) as typeof fetch

  const llmFetch = (async () =>
    jsonResponse(completion(JSON.stringify({ items: [] })))) as unknown as typeof fetch

  const app = createApp({
    vaultPath: root,
    env: {
      ...(options.withTavily === false ? {} : { TAVILY_API_KEY: 'tvly-test' }),
      DEEPSEEK_API_KEY: 'sk-test',
    },
    searchDeps: { fetch: searchFetch },
    llmDeps: { fetch: llmFetch, sleep: async () => undefined },
  })

  return { root, goalId: goal.id, nodes, app, searchCalls: () => searchCalls }
}

function auto(app: ReturnType<typeof createApp>, goalId: string, body: unknown = {}) {
  return app.request(`/api/goals/${goalId}/resources/auto`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDir(dir)
})

describe('资源自动补齐 API', () => {
  it('返回 SSE，按节点推进并落盘', async () => {
    const { root, goalId, app, searchCalls } = setup({
      hits: (query) => [
        {
          title: `资源 ${query.slice(0, 4)}`,
          url: `https://a.test/${encodeURIComponent(query)}`,
          content: '摘要',
        },
      ],
    })

    const response = await auto(app, goalId)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const text = await response.text()
    expect(text).toContain('event: start')
    expect(text).toContain('event: progress')
    expect(text).toContain('event: done')

    const doneLine = text.split('\n\n').find((block) => block.includes('event: done'))
    const data = JSON.parse(doneLine?.split('data: ')[1] ?? '{}') as {
      created?: number
      linked?: number
    }
    expect((data.created ?? 0) + (data.linked ?? 0)).toBeGreaterThan(0)
    expect(searchCalls()).toBe(2)
    expect(listResources(root).length).toBeGreaterThan(0)
  })

  it('没有 Tavily 时走平台搜索页，且不调用搜索', async () => {
    const { root, goalId, app, searchCalls } = setup({ withTavily: false })
    const response = await auto(app, goalId)
    const text = await response.text()
    const startLine = text.split('\n\n').find((block) => block.includes('event: start'))
    const data = JSON.parse(startLine?.split('data: ')[1] ?? '{}') as {
      searchConfigured?: boolean
    }
    expect(data.searchConfigured).toBe(false)
    expect(searchCalls()).toBe(0)
    const resources = listResources(root)
    expect(resources.length).toBeGreaterThan(0)
    expect(resources.every((resource) => resource.unverified === true)).toBe(true)
  })

  it('删除资源返回 204，再查不到', async () => {
    const { root, goalId, nodes, app } = setup()
    const resource = createResource({
      root,
      title: '待删除',
      node: nodes[0]!.id,
      media: '文字',
      level: '入门',
      url: 'https://del.test/1',
    })

    const response = await app.request(`/api/resources/${resource.id}`, { method: 'DELETE' })
    expect(response.status).toBe(204)
    expect(listResources(root)).toHaveLength(0)

    const missing = await app.request('/api/resources/nope', { method: 'DELETE' })
    expect(missing.status).toBe(404)
    expect(goalId).not.toBe('')
  })

  it('手动预览不再限制 5 个节点', async () => {
    const { app, goalId, nodes } = setup({ count: 6 })
    const response = await app.request(`/api/goals/${goalId}/resources/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nodeIds: nodes.map((node) => node.id) }),
    })
    expect(response.status).toBe(200)
  })
})
