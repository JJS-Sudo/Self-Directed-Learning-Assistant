import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { createGoal } from '../src/domain/goals.js'
import { createNode } from '../src/domain/nodes.js'
import { createResource } from '../src/domain/resources.js'
import { safeHref } from '../src/views/resources.js'
import { createEmptyVault, removeDir } from './helpers.js'

const tempDirs: string[] = []

function track(dir: string): string {
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) removeDir(dir)
})

interface Setup {
  vault: string
  goalId: string
  nodeId: string
  otherGoalId: string
}

function setup(): Setup {
  const vault = track(createEmptyVault())
  const goal = createGoal({ root: vault, title: '精通 TypeScript 类型系统' })
  const node = createNode({ root: vault, title: '泛型', goal: goal.id })
  const otherGoal = createGoal({ root: vault, title: '三天完成人生第一个软件设计' })
  const otherNode = createNode({ root: vault, title: '想清楚要做什么', goal: otherGoal.id })

  createResource({
    root: vault,
    title: '泛型入门讲解（视频）',
    node: node.id,
    media: '视频',
    level: '入门',
    durationMin: 20,
    url: 'https://example.com/video',
    tags: ['泛型'],
  })
  createResource({
    root: vault,
    title: '如何写好一句话产品描述',
    node: otherNode.id,
    media: '文字',
    level: '入门',
    url: 'https://example.com/writing',
  })

  return { vault, goalId: goal.id, nodeId: node.id, otherGoalId: otherGoal.id }
}

describe('TG7 · `/resources` 是资源跳转站', () => {
  it('返回 200、是 HTML，每条资源都带可点击外链', async () => {
    const { vault } = setup()
    const response = await createApp({ vaultPath: vault }).request('/resources')

    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('泛型入门讲解（视频）')
    expect(html).toContain('<a class="url" href="https://example.com/video"')
    expect(html).toContain('水平匹配 +')
  })

  it('不提供录入表单', async () => {
    const { vault } = setup()
    const html = await (await createApp({ vaultPath: vault }).request('/resources')).text()

    expect(html).not.toContain('<form')
    expect(html).not.toContain('name="media"')
    expect(html).not.toContain('录入资源')
  })

  it('带 ?goal= 时只显示该目标知识网下的资源', async () => {
    const { vault, otherGoalId } = setup()
    const app = createApp({ vaultPath: vault })

    const all = await (await app.request('/resources')).text()
    expect(all).toContain('泛型入门讲解（视频）')
    expect(all).toContain('如何写好一句话产品描述')

    const filtered = await (await app.request(`/resources?goal=${otherGoalId}`)).text()
    expect(filtered).toContain('如何写好一句话产品描述')
    expect(filtered).not.toContain('泛型入门讲解（视频）')
  })

  it('非 http(s) 的 url 不会被渲染成 href（防 javascript: 注入）', async () => {
    const { vault, nodeId } = setup()
    createResource({
      root: vault,
      title: '可疑链接',
      node: nodeId,
      media: '文字',
      level: '入门',
      url: 'javascript:alert(1)',
    })

    const html = await (await createApp({ vaultPath: vault }).request('/resources')).text()
    expect(html).toContain('javascript:alert(1)')
    expect(html).not.toContain('href="javascript:')
  })

  it('safeHref 只放行 http(s)', () => {
    expect(safeHref('https://a.com')).toBe('https://a.com')
    expect(safeHref('http://a.com')).toBe('http://a.com')
    expect(safeHref('javascript:alert(1)')).toBeUndefined()
    expect(safeHref('file:///C:/x')).toBeUndefined()
    expect(safeHref(undefined)).toBeUndefined()
  })

  it('零外部资源：只给外链，不加载任何外部资源', async () => {
    const { vault } = setup()
    const html = await (await createApp({ vaultPath: vault }).request('/resources')).text()

    expect(html).not.toMatch(/<link\b/i)
    expect(html).not.toMatch(/<script\b/i)
    expect(html).not.toMatch(/<img\b/i)
    expect(html).not.toMatch(/@import/i)
  })
})
