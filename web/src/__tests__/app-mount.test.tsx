/** @vitest-environment jsdom */
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { App } from '../App'

describe('App 外壳', () => {
  it('能挂载', () => {
    const { container } = render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )
    expect(container.querySelector('.shell')).not.toBeNull()
  })
})
