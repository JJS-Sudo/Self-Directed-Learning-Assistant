/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GoalsPage } from '../pages/GoalsPage'

const goal = {
  id: 'g1',
  title: '目标 A',
  kind: '常规',
  status: '在用',
  successCriteria: '能复述',
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-11-04T00:00:00Z',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

let patchPayload: unknown = null
let deleted = false

function installFetch(): void {
  patchPayload = null
  deleted = false
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/goals') return json({ goals: [goal] })
      if (url === '/api/goals?includeArchived=1') return json({ goals: [goal] })
      if (url.endsWith('/map')) return json({ nodes: [{}], warnings: [] })
      if (url.endsWith('/path')) return json({ stages: [{}], questions: [], warnings: [] })
      if (url.endsWith('/resources')) return json({ resources: [{}] })
      if (url === '/api/goals/g1' && init?.method === 'PATCH') {
        patchPayload = JSON.parse(String(init.body)) as unknown
        return json({ goal: { ...goal, title: '改过的目标', status: '暂停' } })
      }
      if (url === '/api/goals/g1' && init?.method === 'DELETE') {
        deleted = true
        return json({ trashId: 'trash-1' })
      }
      if (url === '/api/trash') return json({ entries: [] })
      return new Response('not found', { status: 404 })
    }),
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('目标页编辑与删除', () => {
  it('从卡片菜单打开编辑，提交 PATCH', async () => {
    installFetch()
    render(<GoalsPage />)

    await screen.findByText('目标 A')
    fireEvent.click(screen.getByText('⋯'))
    fireEvent.click(screen.getByText('编辑'))

    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('标题'), {
      target: { value: '改过的目标' },
    })
    fireEvent.change(within(dialog).getByLabelText('状态'), { target: { value: '暂停' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))

    await screen.findByText('目标已更新')
    expect(patchPayload).toMatchObject({
      title: '改过的目标',
      status: '暂停',
      kind: '常规',
    })
  })

  it('删除前确认，确认后调用 DELETE 并刷新', async () => {
    installFetch()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<GoalsPage />)

    await screen.findByText('目标 A')
    fireEvent.click(screen.getByText('⋯'))
    fireEvent.click(screen.getByText('删除'))

    expect(await screen.findByText('已把「目标 A」移入回收站')).not.toBeNull()
    expect(deleted).toBe(true)
    expect(window.confirm).toHaveBeenCalled()
  })

  it('取消确认时不发 DELETE', async () => {
    installFetch()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<GoalsPage />)

    await screen.findByText('目标 A')
    fireEvent.click(screen.getByText('⋯'))
    fireEvent.click(screen.getByText('删除'))

    expect(deleted).toBe(false)
  })

  it('勾选显示已归档会带上 includeArchived', async () => {
    installFetch()
    render(<GoalsPage />)

    await screen.findByText('目标 A')
    fireEvent.click(screen.getByLabelText('显示已归档'))
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/goals?includeArchived=1')
  })
})
