/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsPage } from '../pages/SettingsPage'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

let payload: unknown = null

function installFetch(): void {
  payload = null
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/settings/keys') && init?.method === 'PUT') {
        payload = JSON.parse(String(init.body)) as unknown
        return json({
          deepseek: { configured: true, mask: '••••abcd', source: 'page' },
          tavily: { configured: false },
        })
      }
      if (url.endsWith('/api/settings/keys')) {
        return json({
          deepseek: { configured: false },
          tavily: { configured: true, mask: '••••wxyz', source: 'env' },
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

describe('API Key 设置页', () => {
  it('显示来源，保存后只回显掩码', async () => {
    installFetch()
    render(<SettingsPage />)

    await screen.findByText(/已配置（••••wxyz，来自环境变量）/)
    expect(screen.getByText(/未配置/)).not.toBeNull()

    fireEvent.change(screen.getByLabelText('DeepSeek（知识地图 / 路径 / 元数据） 的 key'), {
      target: { value: 'sk-test-1234' },
    })
    fireEvent.click(screen.getAllByRole('button', { name: '保存' })[0] as HTMLElement)

    await screen.findByText(/已保存；下一次生成\/检索立刻生效/)
    await screen.findByText(/已配置（••••abcd，页面保存）/)
    expect(payload).toEqual({ deepseek: 'sk-test-1234' })
  })

  it('清除 key 发送 null', async () => {
    installFetch()
    render(<SettingsPage />)

    await screen.findByText(/已配置（••••wxyz，来自环境变量）/)
    fireEvent.click(screen.getAllByRole('button', { name: '清除' })[1] as HTMLElement)

    await screen.findByText(/已清除 Tavily key/)
    expect(payload).toEqual({ tavily: null })
  })
})
