/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RetrospectivesPage } from '../pages/RetrospectivesPage'

const goal = {
  id: 'g1',
  title: '目标 A',
  kind: '常规',
  status: '在用',
  createdAt: '2026-10-01T00:00:00Z',
}

const record = {
  id: 'a1',
  sessionId: 's1',
  mode: '做题',
  result: '错误',
  nodeId: 'n1',
  date: '2026-11-01',
}

const stats = {
  total: 1,
  correct: 0,
  wrong: 1,
  unanswered: 0,
  recitalDone: 0,
  recitalPending: 0,
  byNode: [{ nodeId: 'n1', total: 1, correct: 0, accuracy: 0 }],
  suggestedMastery: [{ nodeId: 'n1', mastery: '未学' }],
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

let retroPayload: unknown = null

function installFetch(): void {
  retroPayload = null
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/goals') return json({ goals: [goal] })
      if (url.endsWith('/path')) {
        return json({
          stages: [
            {
              id: 's1',
              title: '第一段',
              estimate: '约 0.5 天',
              order: 1,
              checks: [],
              nodeIds: [],
              questionIds: [],
            },
            {
              id: 's2',
              title: '第二段',
              estimate: '约 1 天',
              order: 2,
              checks: [],
              nodeIds: [],
              questionIds: [],
            },
          ],
          questions: [],
        })
      }
      if (url.includes('/assessments?session=')) return json({ records: [record], stats })
      if (url.endsWith('/assessments')) return json({ records: [record] })
      if (url.endsWith('/retrospectives') && init?.method === 'POST') {
        retroPayload = JSON.parse(String(init.body)) as unknown
        return json({ id: 'r1', adjustEventIds: ['s1'] })
      }
      if (url.endsWith('/retrospectives')) return json({ retrospectives: [] })
      return new Response('not found', { status: 404 })
    }),
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('复盘页', () => {
  it('没有验收记录时给引导', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input)
        if (url === '/api/goals') return json({ goals: [goal] })
        if (url.endsWith('/path')) return json({ stages: [], questions: [] })
        if (url.endsWith('/assessments')) return json({ records: [] })
        if (url.endsWith('/retrospectives')) return json({ retrospectives: [] })
        return new Response('not found', { status: 404 })
      }),
    )
    render(<RetrospectivesPage />)

    await screen.findByText(/还没有验收记录/)
  })

  it('预填建议掌握度，提交时带上选中段，提交后提示段序未变', async () => {
    installFetch()
    render(<RetrospectivesPage />)

    await screen.findByText(/本轮验收/)
    await screen.findByText(/对 0 · 错 1/)
    fireEvent.change(screen.getByLabelText('哪里行（worked）'), {
      target: { value: '几何解释看懂了' },
    })
    fireEvent.change(screen.getByLabelText('哪里卡住（failed）'), {
      target: { value: '正规方程推导卡住' },
    })
    fireEvent.change(screen.getByLabelText('下一步改什么（next_adjustment）'), {
      target: { value: '先练推导' },
    })
    fireEvent.click(screen.getByLabelText('1. 第一段'))
    fireEvent.click(screen.getByRole('button', { name: '写复盘' }))

    await screen.findByText(/已写复盘，回写掌握度「未学」/)

    expect(retroPayload).toMatchObject({
      assessmentId: 'a1',
      worked: '几何解释看懂了',
      failed: '正规方程推导卡住',
      nextAdjustment: '先练推导',
      stageIds: ['s1'],
      mastery: '未学',
    })
  })
})
