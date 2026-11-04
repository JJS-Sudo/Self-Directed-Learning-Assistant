import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { createGoal } from '../src/domain/goals.js'
import { createNode } from '../src/domain/nodes.js'
import { createResource } from '../src/domain/resources.js'
import { TRASH_DIR } from '../src/vault/paths.js'
import { createEmptyVault, removeDir } from './helpers.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDir(dir)
})

function setup() {
  const root = createEmptyVault()
  dirs.push(root)
  const goal = createGoal({ root, title: 'API 目标' })
  const node = createNode({ root, title: '节点', goal: goal.id })
  const resource = createResource({
    root,
    title: '独占资源',
    node: node.id,
    media: '文字',
    level: '入门',
    url: 'https://api.test/1',
  })
  const app = createApp({ vaultPath: root })
  return { root, goal, node, resource, app }
}

function request(app: ReturnType<typeof createApp>, path: string, init: RequestInit) {
  return app.request(path, init)
}

function patch(app: ReturnType<typeof createApp>, id: string, body: unknown) {
  return request(app, `/api/goals/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('目标 PATCH / 回收站 API', () => {
  it('PATCH 更新字段并返回新值', async () => {
    const { goal, app } = setup()
    const response = await patch(app, goal.id, {
      title: '改过的目标',
      status: '暂停',
      successCriteria: '能复述',
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { goal: { title: string; status: string } }
    expect(body.goal.title).toBe('改过的目标')
    expect(body.goal.status).toBe('暂停')
  })

  it('空 body 与激励性缺期限被拒绝', async () => {
    const { goal, app } = setup()
    expect((await patch(app, goal.id, {})).status).toBe(400)
    expect((await patch(app, goal.id, { kind: '激励性' })).status).toBe(400)
  })

  it('DELETE 软删除，列表消失、回收站出现，恢复后回来', async () => {
    const { root, goal, app } = setup()
    const response = await request(app, `/api/goals/${goal.id}`, { method: 'DELETE' })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { trashId: string }
    expect(existsSync(join(root, TRASH_DIR, body.trashId))).toBe(true)

    const listed = (await (await request(app, '/api/goals', { method: 'GET' })).json()) as {
      goals: { id: string }[]
    }
    expect(listed.goals.some((item) => item.id === goal.id)).toBe(false)

    const trash = (await (await request(app, '/api/trash', { method: 'GET' })).json()) as {
      entries: { trashId: string }[]
    }
    expect(trash.entries.some((entry) => entry.trashId === body.trashId)).toBe(true)

    const restored = await request(app, `/api/trash/${body.trashId}/restore`, { method: 'POST' })
    expect(restored.status).toBe(200)
    const after = (await (await request(app, '/api/goals', { method: 'GET' })).json()) as {
      goals: { id: string }[]
    }
    expect(after.goals.some((item) => item.id === goal.id)).toBe(true)
  })

  it('彻底删除返回 204，资源文件也清理', async () => {
    const { root, goal, resource, app } = setup()
    const body = (await (
      await request(app, `/api/goals/${goal.id}`, { method: 'DELETE' })
    ).json()) as { trashId: string }

    const response = await request(app, `/api/trash/${body.trashId}`, { method: 'DELETE' })
    expect(response.status).toBe(204)
    expect(existsSync(join(root, TRASH_DIR, body.trashId))).toBe(false)
    expect(existsSync(join(root, resource.relativePath))).toBe(false)
  })

  it('归档默认隐藏，includeArchived=1 可见', async () => {
    const { goal, app } = setup()
    await patch(app, goal.id, { status: '已归档' })

    const normal = (await (await request(app, '/api/goals', { method: 'GET' })).json()) as {
      goals: { id: string }[]
    }
    expect(normal.goals.some((item) => item.id === goal.id)).toBe(false)

    const all = (await (
      await request(app, '/api/goals?includeArchived=1', { method: 'GET' })
    ).json()) as { goals: { id: string }[] }
    expect(all.goals.some((item) => item.id === goal.id)).toBe(true)
  })

  it('非法回收站 id 被拒绝', async () => {
    const { app } = setup()
    const response = await app.request('/api/trash/..%2F..%2Fetc/restore', { method: 'POST' })
    expect([400, 404]).toContain(response.status)
  })
})
