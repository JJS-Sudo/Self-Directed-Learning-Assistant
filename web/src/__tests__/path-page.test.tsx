/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PathPage } from '../pages/PathPage'

const goal = {
  id: 'g1',
  title: '目标 A',
  kind: '常规',
  status: '在用',
  createdAt: '2026-10-01T00:00:00Z',
}

const stage = (tempId: string, title: string) => ({
  tempId,
  title,
  estimate: '约 0.5 天',
  nodeIds: ['n1'],
  checks: ['能画出两层结构'],
  questions: [
    { tempId: `${tempId}-q1`, kind: '封闭', stem: '题一', answer: '答案', explanation: '解析' },
    { tempId: `${tempId}-q2`, kind: '开放', stem: '讲一遍' },
  ],
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

let commitPayload: unknown = null

function installFetch(options: { previewStatus?: number } = {}): void {
  commitPayload = null
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/goals') return json({ goals: [goal] })
      if (url.endsWith('/map')) {
        return json({ nodes: [{ id: 'n1', title: '第一章', mastery: '未学' }], warnings: [] })
      }
      if (url.endsWith('/path/estimate')) {
        return json({ nodes: 1, leaves: 1, stages: 1, estimatedTokens: 510, costCny: 0.004 })
      }
      if (url.endsWith('/path/preview')) {
        if (options.previewStatus !== undefined && options.previewStatus !== 200) {
          return json(
            { error: { code: 'LLM_NOT_CONFIGURED', message: '未配置' } },
            options.previewStatus,
          )
        }
        return json({
          stages: [stage('s1', '第一段'), stage('s2', '第二段')],
          warnings: [],
          calls: 1,
        })
      }
      if (url.endsWith('/path/commit')) {
        commitPayload = JSON.parse(String(init?.body)) as unknown
        return json({ createdStages: 1, createdQuestions: 2, warnings: [] })
      }
      if (url.endsWith('/path')) return json({ stages: [], questions: [], warnings: [] })
      return new Response('not found', { status: 404 })
    }),
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('路径页', () => {
  it('生成两段后可改判据、删段，提交的 payload 是编辑后的结果', async () => {
    installFetch()
    render(<PathPage />)

    await screen.findByRole('option', { name: '目标 A' })
    fireEvent.click(screen.getByRole('button', { name: '生成路径' }))

    await screen.findByDisplayValue('第一段')
    expect(screen.getByDisplayValue('第二段')).not.toBeNull()

    fireEvent.change(screen.getByLabelText('第 1 段检验信号'), {
      target: { value: '能画出三层结构' },
    })
    fireEvent.click(screen.getAllByRole('button', { name: '删除' })[1] as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: '确认落盘' }))

    await screen.findByText('已创建 1 段、2 道题')

    expect(commitPayload).toMatchObject({
      stages: [{ tempId: 's1', title: '第一段', checks: ['能画出三层结构'] }],
    })
  })

  it('生成失败时显示 code 与原因', async () => {
    installFetch({ previewStatus: 503 })
    render(<PathPage />)

    await screen.findByRole('option', { name: '目标 A' })
    fireEvent.click(screen.getByRole('button', { name: '生成路径' }))

    await screen.findByText(/LLM_NOT_CONFIGURED：未配置/)
  })

  it('空路径显示引导文案', async () => {
    installFetch()
    render(<PathPage />)

    await screen.findByRole('option', { name: '目标 A' })
    await waitFor(() => {
      expect(screen.getByText(/还没有路径/)).not.toBeNull()
    })
  })
})
