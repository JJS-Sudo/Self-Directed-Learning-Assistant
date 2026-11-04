import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { createGoal } from '../src/domain/goals.js'
import { createEmptyVault, removeDir } from './helpers.js'

const tempDirs: string[] = []

function track(dir: string): string {
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) removeDir(dir)
})

/** 仍不存在的入口：知识节点 / 资源 / 题目 / 验收 / 复盘 / 链条 / 画像。
 *  阶段 3 起 `/api/goals` 是**新增**的合法入口，因此不在这里。 */
const REMOVED_ROUTES = [
  '/questions',
  '/api/nodes',
  '/api/events',
  '/api/resources',
  '/api/questions',
  '/api/assessments',
  '/api/retrospectives',
  '/api/chain',
  '/api/profile',
  '/api/vault/write',
]

const REMOVED_POSTS = ['/nodes', '/nodes/related', '/questions', '/api/nodes', '/api/assessments']

describe('TG7 · 旧入口边界（阶段 3 起 /api/goals 是合法新入口）', () => {
  it('保留的路由是 200：探针 / 总目标 / 资源跳转站', async () => {
    const vault = track(createEmptyVault())
    const app = createApp({ vaultPath: vault })

    for (const path of ['/healthz', '/', '/resources']) {
      const response = await app.request(path)
      expect(response.status, path).toBe(200)
    }
  })

  it('被删掉的 GET 路由全部 404', async () => {
    const vault = track(createEmptyVault())
    const app = createApp({ vaultPath: vault })

    for (const path of REMOVED_ROUTES) {
      const response = await app.request(path)
      expect(response.status, path).toBe(404)
    }
  })

  it('被删掉的 POST 路由全部 404', async () => {
    const vault = track(createEmptyVault())
    const app = createApp({ vaultPath: vault })

    for (const path of REMOVED_POSTS) {
      const response = await app.request(path, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'title=x',
      })
      expect(response.status, path).toBe(404)
    }
  })

  it('页面之间可以互相到达（两页导航），没有第三条入口', async () => {
    const vault = track(createEmptyVault())
    createGoal({ root: vault, title: '目标' })
    const html = await (await createApp({ vaultPath: vault }).request('/')).text()

    expect(html).toContain('href="/"')
    expect(html).toContain('href="/resources"')
    expect(html).not.toContain('href="/questions"')
  })
})
