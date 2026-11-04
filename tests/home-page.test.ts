import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { createGoal, listGoals } from '../src/domain/goals.js'
import { createEmptyVault, removeDir } from './helpers.js'

const tempDirs: string[] = []

function track(dir: string): string {
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) removeDir(dir)
})

const FORM = { 'content-type': 'application/x-www-form-urlencoded' }

function formBody(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString()
}

describe('TG7 · `/` 只做总目标设定', () => {
  it('返回 200、是 HTML、含表单', async () => {
    const vault = track(createEmptyVault())
    const response = await createApp({ vaultPath: vault }).request('/')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')

    const html = await response.text()
    expect(html).toContain('<form')
    expect(html).toContain('设定总目标')
  })

  it('表单里只有总目标的字段，没有知识节点 / 资源 / 题目的入口', async () => {
    const vault = track(createEmptyVault())
    const html = await (await createApp({ vaultPath: vault }).request('/')).text()

    for (const field of [
      'name="title"',
      'name="kind"',
      'name="deadline"',
      'name="success_criteria"',
    ]) {
      expect(html, field).toContain(field)
    }
    for (const gone of ['新建节点', '建立相关关系', '录入资源', '录入题目']) {
      expect(html, gone).not.toContain(gone)
    }
  })

  it('提交激励性总目标：303，且 kind / deadline 落盘', async () => {
    const vault = track(createEmptyVault())
    const app = createApp({ vaultPath: vault })

    const response = await app.request('/goals', {
      method: 'POST',
      headers: FORM,
      body: formBody({
        title: '三天完成人生第一个软件设计',
        kind: '激励性',
        deadline: '2026-10-11',
        success_criteria: '有一个能打开、能演示的软件',
      }),
    })

    expect(response.status).toBe(303)
    const goals = listGoals(vault, { today: '2026-10-08' })
    expect(goals).toHaveLength(1)
    expect(goals[0]?.kind).toBe('激励性')
    expect(goals[0]?.deadline).toBe('2026-10-11')
    expect(goals[0]?.daysLeft).toBe(3)
  })

  it('激励性目标缺期限：显示可读错误而不是 500，且不落盘', async () => {
    const vault = track(createEmptyVault())
    const app = createApp({ vaultPath: vault })

    const response = await app.request('/goals', {
      method: 'POST',
      headers: FORM,
      body: formBody({ title: '没有期限的激励性目标', kind: '激励性' }),
    })

    expect(response.status).toBe(400)
    const html = await response.text()
    expect(html).toContain('banner error')
    expect(html).toContain('激励性目标必须给期限')
    expect(listGoals(vault)).toHaveLength(0)
  })

  it('目标列表把类型与剩余天数显示出来', async () => {
    const vault = track(createEmptyVault())
    createGoal({
      root: vault,
      title: '三天完成人生第一个软件设计',
      kind: '激励性',
      deadline: '2026-10-11',
    })

    const html = await (await createApp({ vaultPath: vault }).request('/')).text()
    expect(html).toContain('三天完成人生第一个软件设计')
    expect(html).toContain('激励性')
    expect(html).toContain('期限 2026-10-11')
  })

  it('零外部资源：不引用任何外部 CSS / 字体 / 图片 / 脚本', async () => {
    const vault = track(createEmptyVault())
    const html = await (await createApp({ vaultPath: vault }).request('/')).text()

    expect(html).not.toMatch(/<link\b/i)
    expect(html).not.toMatch(/<script\b/i)
    expect(html).not.toMatch(/<img\b/i)
    expect(html).not.toMatch(/@import/i)
  })
})
