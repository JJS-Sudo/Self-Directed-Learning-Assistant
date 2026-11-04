/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WelcomeDialog } from '../components/WelcomeDialog'

const WECHAT = 'wxid_0bz0pezewo1w22'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function renderDialog(onClose = vi.fn()) {
  render(
    <MemoryRouter>
      <WelcomeDialog open onClose={onClose} />
    </MemoryRouter>,
  )
  return onClose
}

describe('首次使用欢迎弹窗', () => {
  it('包含入门步骤、Key 说明与微信号', () => {
    renderDialog()

    expect(screen.getByRole('heading', { name: /欢迎使用自我导向学习辅助器/ })).not.toBeNull()
    expect(screen.getByText('先建一个目标')).not.toBeNull()
    expect(screen.getByText('配好 API Key')).not.toBeNull()
    expect(screen.getByText(WECHAT)).not.toBeNull()
    expect(screen.getByText(/加好友时备注/)).not.toBeNull()
    expect(screen.getAllByText(/DeepSeek/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Tavily/).length).toBeGreaterThan(0)
  })

  it('复制微信号', async () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    renderDialog()

    fireEvent.click(screen.getByRole('button', { name: /复制/ }))

    expect(writeText).toHaveBeenCalledWith(WECHAT)
    expect(await screen.findByText('已复制')).not.toBeNull()
  })

  it('关闭按钮与 Esc 都会触发 onClose', () => {
    const onClose = renderDialog()

    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('open=false 时不渲染', () => {
    render(
      <MemoryRouter>
        <WelcomeDialog open={false} onClose={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
