/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CandidateEditor } from '../components/CandidateEditor'
import type { MapCandidate } from '@shared/map'

const candidates: MapCandidate[] = [
  { tempId: 'a', title: '甲' },
  { tempId: 'b', title: '乙', parentTempId: 'a' },
  { tempId: 'c', title: '丙' },
]

afterEach(cleanup)

describe('候选编辑器', () => {
  it('改标题时把整份候选传回', () => {
    const onChange = vi.fn()
    render(<CandidateEditor candidates={candidates} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('候选 1 的标题'), { target: { value: '甲改' } })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect((onChange.mock.calls[0]?.[0] as MapCandidate[])[0]?.title).toBe('甲改')
  })

  it('删掉父节点时，子节点自动升为顶层', () => {
    const onChange = vi.fn()
    render(<CandidateEditor candidates={candidates} onChange={onChange} />)

    fireEvent.click(screen.getAllByRole('button', { name: '删除' })[0] as HTMLElement)

    const next = onChange.mock.calls[0]?.[0] as MapCandidate[]
    expect(next.map((item) => item.tempId)).toEqual(['b', 'c'])
    expect(next[0]?.parentTempId).toBeUndefined()
  })

  it('父级下拉里不会出现自己的后代（防止成环）', () => {
    render(<CandidateEditor candidates={candidates} onChange={() => undefined} />)

    const rows = screen.getAllByRole('listitem')
    const firstRow = rows[0] as HTMLElement

    // 甲的子树里有乙，所以乙不能作为甲的父级
    const options = within(firstRow)
      .getAllByRole('option')
      .map((option) => option.textContent)
    expect(options).toEqual(['顶层', '属于：丙'])
  })
})
