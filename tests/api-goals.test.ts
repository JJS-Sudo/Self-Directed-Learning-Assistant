import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { indexFilePath } from '../src/index-db/db.js'
import { removeIndexFile } from '../src/index-db/with-index.js'
import type { GoalListItem } from '../src/shared/goals.js'
import { createEmptyVault, removeDir } from './helpers.js'

const dirs: string[] = []

function newApp(): { root: string; app: ReturnType<typeof createApp> } {
  const root = createEmptyVault()
  dirs.push(root)
  return { root, app: createApp({ vaultPath: root }) }
}

function post(app: ReturnType<typeof createApp>, body: unknown) {
  return app.request('/api/goals', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function dateIn(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function goalFiles(root: string): string[] {
  return readdirSync(join(root, '10-目标')).filter((name) => name.endsWith('.md'))
}

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDir(dir)
})

describe('目标 API', () => {
  it('空库返回空列表', async () => {
    const { app } = newApp()
    const response = await app.request('/api/goals')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ goals: [] })
  })

  it('创建后返回 201，Markdown 落盘且列表里能看到', async () => {
    const { root, app } = newApp()
    const response = await post(app, { title: '三天搞懂索引', kind: '激励性', deadline: dateIn(3) })

    expect(response.status).toBe(201)
    const body = (await response.json()) as { goal: GoalListItem }
    expect(body.goal.id).toMatch(/^[a-z0-9]{6}$/)
    expect(body.goal.daysLeft).toBe(3)
    expect(goalFiles(root)).toHaveLength(1)

    const list = (await (await app.request('/api/goals')).json()) as { goals: GoalListItem[] }
    expect(list.goals.map((goal) => goal.id)).toEqual([body.goal.id])
  })

  it('缺 title 返回 400，且不产生文件', async () => {
    const { root, app } = newApp()
    const response = await post(app, { kind: '常规' })

    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('INVALID_INPUT')
    expect(body.error.message).toContain('title')
    expect(goalFiles(root)).toHaveLength(0)
  })

  it('激励性缺期限返回 400，并说明原因', async () => {
    const { root, app } = newApp()
    const response = await post(app, { title: '没有期限的激励目标', kind: '激励性' })

    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: { message: string } }
    expect(body.error.message).toContain('期限')
    expect(goalFiles(root)).toHaveLength(0)
  })

  it('非法日期格式返回 400', async () => {
    const { app } = newApp()
    const response = await post(app, { title: '坏日期', kind: '激励性', deadline: '2026/01/01' })

    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: { message: string } }
    expect(body.error.message).toContain('YYYY-MM-DD')
  })

  it('请求体不是 JSON 时返回 400', async () => {
    const { app } = newApp()
    const response = await app.request('/api/goals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    })

    expect(response.status).toBe(400)
  })

  it('列表按新→旧返回（D9）', async () => {
    const { app } = newApp()
    await post(app, { title: '先建的', kind: '常规' })
    await new Promise((resolve) => setTimeout(resolve, 15))
    await post(app, { title: '后建的', kind: '常规' })

    const list = (await (await app.request('/api/goals')).json()) as { goals: GoalListItem[] }
    expect(list.goals.map((goal) => goal.title)).toEqual(['后建的', '先建的'])
  })

  it('删掉索引文件后，不重启也能从 Markdown 恢复列表', async () => {
    const { root, app } = newApp()
    await post(app, { title: '删索引也要在', kind: '常规' })
    expect(existsSync(indexFilePath(root))).toBe(true)

    removeIndexFile(root)
    const response = await app.request('/api/goals')
    const body = (await response.json()) as { goals: GoalListItem[] }

    expect(response.status).toBe(200)
    expect(body.goals.map((goal) => goal.title)).toEqual(['删索引也要在'])
    expect(existsSync(indexFilePath(root))).toBe(true)
  })
})
