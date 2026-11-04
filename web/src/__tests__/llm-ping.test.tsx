/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, it, vi } from 'vitest'
import { LlmPing } from '../components/LlmPing'

function mockPing(body: unknown, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('模型连接卡片', () => {
  it('未配置时显示环境变量指引，而不是报错', async () => {
    mockPing({ configured: false, ok: false })
    render(<LlmPing />)

    fireEvent.click(screen.getByRole('button', { name: '测试连接' }))

    await screen.findByText(/未配置：设置环境变量/)
  })

  it('成功时显示模型名与耗时', async () => {
    mockPing({ configured: true, ok: true, model: 'deepseek-chat', durationMs: 123 })
    render(<LlmPing />)

    fireEvent.click(screen.getByRole('button', { name: '测试连接' }))

    await screen.findByText(/连接正常 · deepseek-chat · 123ms/)
  })

  it('上游拒绝时显示 code 与原因', async () => {
    mockPing({ error: { code: 'LLM_AUTH', message: '凭据无效' } }, 502)
    render(<LlmPing />)

    fireEvent.click(screen.getByRole('button', { name: '测试连接' }))

    await screen.findByText(/LLM_AUTH：凭据无效/)
  })
})
