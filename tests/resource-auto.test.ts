import { afterEach, describe, expect, it } from 'vitest'
import { createGoal } from '../src/domain/goals.js'
import { createNode } from '../src/domain/nodes.js'
import { createStage } from '../src/domain/path-stages.js'
import { listResources } from '../src/domain/resources.js'
import { LlmConfig } from '../src/llm/config.js'
import { autoResources, type AutoResourceEvent } from '../src/resource-search/auto.js'
import type { SearchHit, SearchProvider } from '../src/search/types.js'
import { completion, jsonResponse } from './llm-fixtures.js'
import { createEmptyVault, removeDir } from './helpers.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDir(dir)
})

function setup(count = 2) {
  const root = createEmptyVault()
  dirs.push(root)
  const goal = createGoal({ root, title: '自动资源测试' })
  const nodes = Array.from({ length: count }, (_, index) =>
    createNode({ root, title: `知识点 ${index + 1}`, goal: goal.id }),
  )
  createStage({
    root,
    goal: goal.id,
    title: '第一阶段',
    estimate: '约 1 天',
    nodes: nodes.map((node) => node.id),
    checks: ['能独立复述该知识点并给出一个例子'],
  })
  return { root, goalId: goal.id, nodes }
}

function fixedSearch(hits: SearchHit[]): SearchProvider & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    async search(query) {
      calls.push(query)
      return hits
    },
  }
}

function events(log: AutoResourceEvent[]) {
  return {
    onEvent: (event: AutoResourceEvent) => {
      log.push(event)
    },
  }
}

describe('资源自动编排', () => {
  it('为路径里的每个节点检索并落盘', async () => {
    const { root, goalId, nodes } = setup(2)
    const search: SearchProvider = {
      async search(query) {
        const index = query.includes('知识点 1') ? 1 : 2
        return [{ title: `文章 ${index}`, url: `https://a.test/${index}`, snippet: '摘要' }]
      },
    }
    const result = await autoResources({
      root,
      goalId,
      search,
      llm: null,
    })

    expect(result.created).toBe(2)
    const resources = listResources(root)
    expect(resources).toHaveLength(2)
    expect(resources.map((resource) => resource.nodeIds[0]).sort()).toEqual(
      nodes.map((node) => node.id).sort(),
    )
  })

  it('同一 URL 被两个节点命中时只创建一份，并关联两个节点', async () => {
    const { root, goalId } = setup(2)
    const search = fixedSearch([{ title: '共享文章', url: 'https://shared.test/1', snippet: '' }])
    const result = await autoResources({ root, goalId, search, llm: null })

    expect(result.created).toBe(1)
    expect(result.linked).toBe(1)
    const resources = listResources(root)
    expect(resources).toHaveLength(1)
    expect(resources[0]?.nodeIds).toHaveLength(2)
  })

  it('没有搜索源时生成平台搜索页并标记未验证', async () => {
    const { root, goalId } = setup(2)
    const result = await autoResources({ root, goalId, search: null, llm: null })

    expect(result.created).toBeGreaterThan(0)
    const resources = listResources(root)
    expect(resources.every((resource) => resource.unverified === true)).toBe(true)
    expect(resources.some((resource) => resource.url?.includes('search.bilibili.com'))).toBe(true)
    expect(resources.every((resource) => resource.url?.startsWith('https://'))).toBe(true)
  })

  it('单节点失败不影响其他节点', async () => {
    const { root, goalId } = setup(2)
    let call = 0
    const search: SearchProvider = {
      async search() {
        call += 1
        if (call === 1) throw new Error('模拟搜索失败')
        return [{ title: '可用文章', url: 'https://ok.test/1', snippet: '' }]
      },
    }
    const result = await autoResources({ root, goalId, search, llm: null })

    expect(result.failures).toBe(1)
    expect(result.created).toBe(1)
  })

  it('超过上限时截断并标记', async () => {
    const { root, goalId } = setup(3)
    const result = await autoResources({
      root,
      goalId,
      search: null,
      llm: null,
      maxNodes: 2,
    })

    expect(result.truncated).toBe(true)
    expect(listResources(root).length).toBeLessThanOrEqual(4)
  })

  it('有搜索源时只调用一次批量判定', async () => {
    const { root, goalId } = setup(2)
    let llmCalls = 0
    const config = new LlmConfig({
      apiKey: 'sk-test',
      baseUrl: 'http://llm.test',
      model: 'deepseek-chat',
      timeoutMs: 1000,
      maxRetries: 0,
      maxTokens: 1000,
      maxInputChars: 10_000,
    })
    const deps = {
      fetch: (async () => {
        llmCalls += 1
        return jsonResponse(
          completion(
            JSON.stringify({
              items: [
                { url: 'https://a.test/1', level: '进阶', media: '文字' },
                { url: 'https://a.test/2', level: '入门', media: '视频' },
              ],
            }),
          ),
        )
      }) as unknown as typeof fetch,
      sleep: async () => undefined,
    }
    const search = fixedSearch([
      { title: '文章一', url: 'https://a.test/1', snippet: '' },
      { title: '视频一', url: 'https://a.test/2', snippet: '' },
    ])
    const result = await autoResources({
      root,
      goalId,
      search,
      llm: { config, deps },
    })

    expect(llmCalls).toBe(1)
    expect(result.created).toBe(2)
    expect(
      listResources(root)
        .map((resource) => resource.level)
        .sort(),
    ).toEqual(['入门', '进阶'])
  })

  it('开始事件包含总数与搜索配置状态', async () => {
    const { root, goalId } = setup(2)
    const log: AutoResourceEvent[] = []
    await autoResources({ root, goalId, search: null, llm: null, ...events(log) })

    expect(log[0]).toMatchObject({ type: 'start', total: 2, searchConfigured: false })
    expect(log.at(-1)).toMatchObject({ type: 'done' })
  })
})
