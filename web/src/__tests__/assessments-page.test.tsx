/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AssessmentsPage } from '../pages/AssessmentsPage'

const goal = {
  id: 'g1',
  title: '目标 A',
  kind: '常规',
  status: '在用',
  createdAt: '2026-10-01T00:00:00Z',
}

const questions = [
  { id: 'q1', kind: '封闭', stem: '题一：最小二乘的准则？', nodeId: 'n1' },
  { id: 'q2', kind: '开放', stem: '题二：用自己的话讲清拟合优度', nodeId: 'n1' },
]

const stats = {
  total: 2,
  correct: 1,
  wrong: 0,
  unanswered: 1,
  recitalDone: 0,
  recitalPending: 0,
  byNode: [{ nodeId: 'n1', total: 2, correct: 1, accuracy: 0.5 }],
  suggestedMastery: [{ nodeId: 'n1', mastery: '在学' }],
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

let submitPayload: unknown = null

function installFetch(): void {
  submitPayload = null
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/goals') return json({ goals: [goal] })
      if (url.endsWith('/path')) return json({ stages: [], questions })
      if (url.endsWith('/map')) {
        return json({ nodes: [{ id: 'n1', title: '最小二乘估计', mastery: '未学' }], warnings: [] })
      }
      if (url.endsWith('/assessments') && init?.method === 'POST') {
        submitPayload = JSON.parse(String(init.body)) as unknown
        return json({ sessionId: 's1', records: [], stats })
      }
      return new Response('not found', { status: 404 })
    }),
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('验收页', () => {
  it('没有题目时给引导，不显示交卷按钮', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input)
        if (url === '/api/goals') return json({ goals: [goal] })
        if (url.endsWith('/path')) return json({ stages: [], questions: [] })
        if (url.endsWith('/map')) return json({ nodes: [], warnings: [] })
        return new Response('not found', { status: 404 })
      }),
    )
    render(<AssessmentsPage />)

    await screen.findByText(/这个目标还没有题目/)
    expect(screen.queryByRole('button', { name: '交卷' })).toBeNull()
  })

  it('未选的题也按未作答提交，交卷后显示统计与建议', async () => {
    installFetch()
    render(<AssessmentsPage />)

    await screen.findByText(/题一：最小二乘的准则/)
    fireEvent.click(screen.getAllByLabelText('正确')[0] as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: '交卷' }))

    await screen.findByText(/对 1 · 错 0 · 未答 1/)
    await screen.findByText(/最小二乘估计：正确率 50%/)
    await screen.findByText(/建议 在学/)

    expect(submitPayload).toMatchObject({
      questionIds: ['q1', 'q2'],
      answers: [
        { questionId: 'q1', result: '正确' },
        { questionId: 'q2', result: '未作答' },
      ],
    })
  })
})
