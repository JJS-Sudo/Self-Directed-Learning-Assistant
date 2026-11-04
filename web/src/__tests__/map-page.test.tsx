/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MapPage } from '../pages/MapPage'

const goal = {
  id: 'g1',
  title: '目标 A',
  kind: '常规',
  status: '在用',
  createdAt: '2026-10-01T00:00:00Z',
}

const estimate = {
  sections: 2,
  chunks: 1,
  inputChars: 10,
  inputTokens: 7,
  outputTokens: 640,
  costCny: 0.005,
}

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
      if (url.endsWith('/map/ai')) {
        if (options.previewStatus !== undefined && options.previewStatus !== 200) {
          return json(
            { error: { code: 'LLM_NOT_CONFIGURED', message: '未配置 DEEPSEEK_API_KEY' } },
            options.previewStatus,
          )
        }
        return json({
          candidates: [
            { tempId: 'a', title: '甲' },
            { tempId: 'b', title: '乙', parentTempId: 'a' },
          ],
          warnings: [],
          research: { used: false, sources: [] },
          estimate,
        })
      }
      if (url.endsWith('/map/commit')) {
        commitPayload = JSON.parse(String(init?.body)) as unknown
        return json({ created: 2, warnings: [] })
      }
      if (url.endsWith('/map')) return json({ nodes: [], warnings: [] })
      return new Response('not found', { status: 404 })
    }),
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('地图页', () => {
  it('默认模式：主按钮可用，材料入口是独立页面链接', async () => {
    installFetch()
    render(<MapPage />)

    await screen.findByRole('option', { name: '目标 A' })

    const aiButton = screen.getByRole('button', { name: 'AI 自动生成知识地图' })
    expect(aiButton).toHaveProperty('disabled', false)

    const materialLink = screen.getByRole('link', { name: '导入材料生成' })
    expect(materialLink.getAttribute('href')).toContain('/map/material?goal=g1')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('AI 生成候选 → 确认落盘，提交的 payload 是编辑后的候选', async () => {
    installFetch()
    render(<MapPage />)

    await screen.findByRole('option', { name: '目标 A' })

    fireEvent.click(screen.getByRole('button', { name: 'AI 自动生成知识地图' }))
    await screen.findByDisplayValue('甲')
    expect(screen.getByDisplayValue('乙')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '确认落盘' }))
    await screen.findByText('已创建 2 个节点')

    expect(commitPayload).toEqual({
      candidates: [
        { tempId: 'a', title: '甲' },
        { tempId: 'b', title: '乙', parentTempId: 'a' },
      ],
      edges: [],
    })
  })

  it('生成返回 503 时把 code 与原因显示出来', async () => {
    installFetch({ previewStatus: 503 })
    render(<MapPage />)

    await screen.findByRole('option', { name: '目标 A' })
    fireEvent.click(screen.getByRole('button', { name: 'AI 自动生成知识地图' }))

    await screen.findByText(/LLM_NOT_CONFIGURED：未配置 DEEPSEEK_API_KEY/)
    expect(screen.queryAllByRole('button', { name: '确认落盘' })).toHaveLength(0)
  })
})
