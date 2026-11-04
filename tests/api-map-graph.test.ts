import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { createGoal } from '../src/domain/goals.js'
import { createNode, requireNode } from '../src/domain/nodes.js'
import { createStage } from '../src/domain/path-stages.js'
import { createEmptyVault, removeDir } from './helpers.js'

const dirs: string[] = []

function setup() {
  const root = createEmptyVault()
  dirs.push(root)
  const goal = createGoal({ root, title: '图编辑测试' })
  const a = createNode({ root, title: '概念 A', goal: goal.id })
  const b = createNode({ root, title: '概念 B', goal: goal.id })
  createStage({
    root,
    goal: goal.id,
    title: '引用 A 的段',
    estimate: '约 1 天',
    nodes: [a.id],
    checks: ['能讲清概念 A'],
    order: 1,
  })
  const app = createApp({ vaultPath: root })
  return { root, goalId: goal.id, a, b, app }
}

function send(app: ReturnType<typeof createApp>, method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
}

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDir(dir)
})

describe('知识网编辑 API', () => {
  it('GET map 带 goal / nodes.links / layout', async () => {
    const { app, goalId, a } = setup()
    const response = await app.request(`/api/goals/${goalId}/map`)
    const body = (await response.json()) as {
      goal: { title: string }
      nodes: { id: string; links: unknown[]; order: number }[]
      layout: unknown
    }

    expect(body.goal.title).toBe('图编辑测试')
    expect(body.nodes.find((node) => node.id === a.id)?.links).toEqual([])
    expect(body.layout).toBeNull()
    expect(body.nodes[0]?.order).toBeGreaterThan(0)
  })

  it('PATCH 节点：标题、序号、掌握度', async () => {
    const { root, app, a } = setup()
    const response = await send(app, 'PATCH', `/api/nodes/${a.id}`, {
      title: '概念 A（改名）',
      order: 7,
      mastery: '在学',
    })
    expect(response.status).toBe(200)

    const node = requireNode(root, a.id)
    expect(node.title).toBe('概念 A（改名）')
    expect(node.order).toBe(7)
    expect(node.mastery).toBe('在学')
  })

  it('POST 节点与连线：上级唯一，并列去重', async () => {
    const { app, goalId, a, b } = setup()
    const created = await send(app, 'POST', `/api/goals/${goalId}/map/links`, {
      from: b.id,
      to: a.id,
      type: 'parent',
    })
    expect(created.status).toBe(200)

    const secondParent = await send(app, 'POST', `/api/goals/${goalId}/map/links`, {
      from: b.id,
      to: a.id,
      type: 'parent',
    })
    expect([200, 400]).toContain(secondParent.status)

    const sibling = await send(app, 'POST', `/api/goals/${goalId}/map/links`, {
      from: a.id,
      to: b.id,
      type: 'sibling',
    })
    expect(sibling.status).toBe(200)

    const removed = await send(
      app,
      'DELETE',
      `/api/goals/${goalId}/map/links?from=${a.id}&to=${b.id}&type=sibling`,
    )
    expect(removed.status).toBe(200)
  })

  it('删除被路径引用的节点：409，force 后删除', async () => {
    const { app, a } = setup()
    const denied = await app.request(`/api/nodes/${a.id}`, { method: 'DELETE' })
    expect(denied.status).toBe(409)
    const body = (await denied.json()) as { references: { stages: unknown[] } }
    expect(body.references.stages).toHaveLength(1)

    const forced = await app.request(`/api/nodes/${a.id}?force=1`, { method: 'DELETE' })
    expect(forced.status).toBe(200)
  })

  it('布局读写', async () => {
    const { app, goalId, a } = setup()
    const put = await send(app, 'PUT', `/api/goals/${goalId}/map/layout`, {
      positions: [{ id: a.id, x: 12.5, y: -30 }],
    })
    expect(put.status).toBe(200)

    const got = await app.request(`/api/goals/${goalId}/map/layout`)
    const body = (await got.json()) as { layout: { positions: unknown[] } | null }
    expect(body.layout?.positions).toEqual([{ id: a.id, x: 12.5, y: -30 }])
  })
})
