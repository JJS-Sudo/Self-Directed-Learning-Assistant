/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResourcesPage } from '../pages/ResourcesPage'

const goal = {
  id: 'g1',
  title: '目标 A',
  kind: '常规',
  status: '在用',
  createdAt: '2026-10-01T00:00:00Z',
}

const existing = {
  id: 'r1',
  title: '已有的视频',
  url: 'https://old.test/1',
  nodeId: 'n1',
  nodeTitle: '最小二乘估计',
  level: '入门',
  media: '视频',
  durationMin: 20,
  score: 2.5,
  rankReason: '媒介与你的偏好一致（视频），时长 20 分钟在预算内',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

let commitPayload: unknown = null

function installFetch(options: { preview?: unknown[] } = {}): void {
  commitPayload = null
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/goals') return json({ goals: [goal] })
      if (url.endsWith('/map')) {
        return json({
          nodes: [{ id: 'n1', title: '最小二乘估计', mastery: '未学' }],
          warnings: [],
        })
      }
      if (url.endsWith('/resources/preview')) {
        return json({
          candidates: options.preview ?? [
            {
              nodeId: 'n1',
              title: '视频一',
              url: 'https://v.test/1',
              snippet: '讲最小二乘',
              level: '入门',
              media: '视频',
              durationMin: 18,
            },
          ],
          perNode: [{ nodeId: 'n1', query: '最小二乘估计 目标 A 视频', found: 1 }],
          warnings: [],
        })
      }
      if (url.endsWith('/resources/commit')) {
        commitPayload = JSON.parse(String(init?.body)) as unknown
        return json({ created: 1, skipped: [], warnings: [] })
      }
      if (url.endsWith('/resources')) {
        return json({
          resources: [existing],
          profile: { level: '入门', mediaPreference: '视频', timeBudget: 30 },
        })
      }
      return new Response('not found', { status: 404 })
    }),
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('资源页', () => {
  it('选节点 → 检索 → 落盘，提交的 payload 带等级与媒介', async () => {
    installFetch()
    render(<ResourcesPage />)

    const checkbox = await screen.findByRole('checkbox', { name: '最小二乘估计' })
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: /检索候选/ }))

    await screen.findByDisplayValue('视频一')
    fireEvent.click(screen.getByRole('button', { name: /落盘所选/ }))

    await screen.findByText('已落盘 1 条')

    expect(commitPayload).toEqual({
      resources: [
        {
          nodeId: 'n1',
          title: '视频一',
          url: 'https://v.test/1',
          level: '入门',
          media: '视频',
          durationMin: 18,
        },
      ],
    })
  })

  it('没搜到时不报错，只给提示', async () => {
    installFetch({ preview: [] })
    render(<ResourcesPage />)

    fireEvent.click(await screen.findByRole('checkbox', { name: '最小二乘估计' }))
    fireEvent.click(screen.getByRole('button', { name: /检索候选/ }))

    await screen.findByText(/没搜到可用资源/)
    expect(screen.queryByRole('button', { name: /落盘所选/ })).toBeNull()
  })

  it('已收录资源带实时理由', async () => {
    installFetch()
    render(<ResourcesPage />)

    await screen.findByText(/媒介与你的偏好一致/)
    expect(screen.getByText('已有的视频')).not.toBeNull()
    expect(screen.getByText('2.50')).not.toBeNull()
  })
})
