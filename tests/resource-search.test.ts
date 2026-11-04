import { describe, expect, it } from 'vitest'
import type { GoalSummary } from '../src/domain/goals.js'
import type { MapNodeSummary } from '../src/domain/nodes.js'
import type { Profile } from '../src/domain/profile.js'
import { previewResources } from '../src/resource-search/preview.js'
import { buildQuery } from '../src/resource-search/query.js'
import type { SearchHit, SearchProvider } from '../src/search/types.js'
import { completion, fakeFetch, jsonResponse, testConfig } from './llm-fixtures.js'

const goal: GoalSummary = {
  id: 'g1',
  title: '掌握一元线性回归',
  status: '在用',
  kind: '常规',
  relativePath: '10-目标/g1.md',
  createdAt: '2026-01-01T00:00:00Z',
}

function node(id: string, title: string): MapNodeSummary {
  return {
    id,
    title,
    order: 1,
    mastery: '未学',
    status: '在用',
    relatedIds: [],
    links: [],
    relativePath: `20-学习项目/g1/${id}.md`,
    createdAt: '2026-01-01T00:00:00Z',
  }
}

const profile: Profile = {
  id: 'p1',
  relativePath: '00-系统/画像.md',
  level: '入门',
  mediaPreference: '视频',
  timeBudget: 30,
}

function provider(hitsByTitle: Record<string, SearchHit[]>): {
  search: SearchProvider
  queries: { query: string; maxResults: number | undefined }[]
} {
  const queries: { query: string; maxResults: number | undefined }[] = []
  return {
    search: {
      async search(query: string, options) {
        queries.push({ query, maxResults: options?.maxResults })
        const key = Object.keys(hitsByTitle).find((title) => query.includes(title))
        return key === undefined ? [] : (hitsByTitle[key] ?? [])
      },
    },
    queries,
  }
}

function hit(title: string, url: string): SearchHit {
  return { title, url, snippet: `关于 ${title} 的摘要` }
}

const metadataJson = (items: unknown[]): string => JSON.stringify({ items })

describe('查询构造', () => {
  it('节点 + 目标 + 媒介偏好', () => {
    expect(buildQuery('最小二乘估计', '掌握一元线性回归', '视频')).toBe(
      '最小二乘估计 掌握一元线性回归 视频 教程',
    )
    expect(buildQuery('最小二乘估计', '掌握一元线性回归', '文字')).toBe(
      '最小二乘估计 掌握一元线性回归 教程 文章',
    )
    expect(buildQuery('最小二乘估计', '掌握一元线性回归', '不限')).toBe(
      '最小二乘估计 掌握一元线性回归',
    )
  })
})

describe('资源预览', () => {
  it('逐节点检索、按 URL 去重、补上元数据', async () => {
    const { search, queries } = provider({
      最小二乘估计: [hit('视频一', 'https://v.test/1'), hit('视频二', 'https://v.test/2')],
      '高斯-马尔可夫定理': [
        hit('视频二重复', 'https://v.test/2'),
        hit('文章一', 'https://a.test/1'),
      ],
    })
    const { fetch, calls } = fakeFetch(() =>
      jsonResponse(
        completion(
          metadataJson([
            { url: 'https://v.test/1', level: '入门', media: '视频', duration_min: 18 },
            { url: 'https://v.test/2', level: '进阶', media: '视频' },
            { url: 'https://a.test/1', level: '入门', media: '文字' },
          ]),
        ),
      ),
    )

    const result = await previewResources({
      config: testConfig(),
      goal,
      nodes: [node('A', '最小二乘估计'), node('B', '高斯-马尔可夫定理')],
      profile,
      search,
      deps: { fetch },
    })

    expect(queries).toHaveLength(2)
    expect(queries[0]?.query).toContain('最小二乘估计')
    expect(queries[0]?.query).toContain('掌握一元线性回归')
    expect(queries[0]?.query).toContain('视频')
    expect(calls).toHaveLength(1)

    expect(result.candidates).toHaveLength(3)
    expect(result.candidates[0]).toMatchObject({
      nodeId: 'A',
      url: 'https://v.test/1',
      level: '入门',
      media: '视频',
      durationMin: 18,
    })
    expect(result.candidates[2]?.nodeId).toBe('B')
    expect(result.warnings).toEqual([])
  })

  it('某个节点没搜到：found 0 + 明确警告', async () => {
    const { search } = provider({ 最小二乘估计: [hit('视频一', 'https://v.test/1')] })
    const { fetch } = fakeFetch(() =>
      jsonResponse(
        completion(metadataJson([{ url: 'https://v.test/1', level: '入门', media: '视频' }])),
      ),
    )

    const result = await previewResources({
      config: testConfig(),
      goal,
      nodes: [node('A', '最小二乘估计'), node('B', '冷门概念')],
      profile,
      search,
      deps: { fetch },
    })

    expect(result.perNode.map((item) => item.found)).toEqual([1, 0])
    expect(result.warnings.join('')).toContain('没搜到可用资源')
  })

  it('全都没搜到：一次模型都不调', async () => {
    const { search } = provider({})
    const { fetch, calls } = fakeFetch(() => jsonResponse(completion('{}')))

    const result = await previewResources({
      config: testConfig(),
      goal,
      nodes: [node('A', '甲'), node('B', '乙')],
      profile,
      search,
      deps: { fetch },
    })

    expect(calls).toHaveLength(0)
    expect(result.candidates).toEqual([])
    expect(result.warnings).toHaveLength(2)
  })

  it('元数据非法（等级不在词表）被丢弃并警告，其余字段保留', async () => {
    const { search } = provider({ 最小二乘估计: [hit('视频一', 'https://v.test/1')] })
    const { fetch, calls } = fakeFetch(() =>
      jsonResponse(
        completion(metadataJson([{ url: 'https://v.test/1', level: '高级', media: '视频' }])),
      ),
    )

    const result = await previewResources({
      config: testConfig(),
      goal,
      nodes: [node('A', '最小二乘估计')],
      profile,
      search,
      deps: { fetch },
    })

    expect(calls).toHaveLength(1)
    expect(result.candidates[0]?.media).toBe('视频')
    expect(result.candidates[0]?.level).toBeUndefined()
    expect(result.warnings.join('')).toContain('等级不在词表')
  })
})
