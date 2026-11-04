import { describe, expect, it } from 'vitest'
import { platformLinkCandidates } from '../src/resource-search/platform-links.js'

const profile = { level: '入门', mediaPreference: '不限' }

describe('平台搜索页兜底', () => {
  it('视频偏好生成 B 站 + YouTube，标题带节点名', () => {
    const links = platformLinkCandidates(
      { id: 'n1', title: '贝叶斯定理' },
      { ...profile, mediaPreference: '视频' },
    )
    expect(links).toHaveLength(2)
    expect(links.map((link) => link.platform)).toEqual(['B站', 'YouTube'])
    expect(links[0]?.url).toContain(encodeURIComponent('贝叶斯定理'))
    expect(links[0]?.unverified).toBe(true)
  })

  it('文字偏好只生成 Bing', () => {
    const links = platformLinkCandidates(
      { id: 'n1', title: '贝叶斯定理' },
      { ...profile, mediaPreference: '文字' },
    )
    expect(links).toHaveLength(1)
    expect(links[0]?.platform).toBe('Bing')
  })

  it('代码类节点优先 MDN，并且最多两条', () => {
    const links = platformLinkCandidates(
      { id: 'n1', title: 'TypeScript 泛型' },
      { ...profile, mediaPreference: '视频' },
    )
    expect(links[0]?.platform).toBe('MDN')
    expect(links.length).toBeLessThanOrEqual(2)
    expect(links.every((link) => link.url.startsWith('https://'))).toBe(true)
  })
})
