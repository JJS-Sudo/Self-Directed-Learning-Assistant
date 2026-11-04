/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QualityPage } from '../pages/QualityPage'

const goal = {
  id: 'g1',
  title: '目标 A',
  kind: '常规',
  status: '在用',
  createdAt: '2026-10-01T00:00:00Z',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

let budgetPayload: unknown = null
let commitPayload: unknown = null

function installFetch(): void {
  budgetPayload = null
  commitPayload = null
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/goals') return json({ goals: [goal] })
      if (url.endsWith('/quality')) {
        return json({
          warnings: [{ category: '地图', message: '没有被任何路径段覆盖的叶子节点：甲' }],
          failures: [],
          runs: [{ at: '2026-11-01T10:00:00Z', kind: '地图', ok: true, costCny: 0.5 }],
          budget: { budgetCny: 1, spentCny: 3, over: true },
        })
      }
      if (url.endsWith('/map')) {
        return json({ nodes: [{ id: 'n1', title: '节点 A', mastery: '未学' }], warnings: [] })
      }
      if (url.endsWith('/budget')) {
        budgetPayload = JSON.parse(String(init?.body)) as unknown
        return json({ goal: { id: 'g1', budgetCny: 2 } })
      }
      if (url.endsWith('/regenerate')) {
        return json({ candidates: [{ title: '修好的 A' }], warnings: [], costCny: 0.01 })
      }
      if (url.endsWith('/map/commit')) {
        commitPayload = JSON.parse(String(init?.body)) as unknown
        return json({ created: 1, warnings: [] })
      }
      return new Response('not found', { status: 404 })
    }),
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('质量页', () => {
  it('显示超预算、保存预算、勾选节点重生成并追加', async () => {
    installFetch()
    render(<QualityPage />)

    await screen.findByText(/已超预算/)
    await screen.findByText(/没有被任何路径段覆盖的叶子节点：甲/)

    fireEvent.change(screen.getByLabelText('预算'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: '保存预算' }))
    await screen.findByText(/预算已设为 ¥2/)
    expect(budgetPayload).toEqual({ budgetCny: 2 })

    fireEvent.click(screen.getByRole('checkbox', { name: '节点 A' }))
    fireEvent.click(screen.getByRole('button', { name: '重生成选中节点' }))
    await screen.findByText('修好的 A')

    fireEvent.click(screen.getByRole('button', { name: '确认追加' }))
    await screen.findByText(/已追加 1 个修复节点/)
    expect(commitPayload).toEqual({
      candidates: [{ tempId: 'regen-0', title: '修好的 A' }],
    })
  })
})
