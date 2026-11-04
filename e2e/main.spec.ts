import { expect, test } from '@playwright/test'

const goal = 'E2E 目标'

// 首次打开的欢迎弹窗会挡住交互；E2E 里预置「已看过」
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('sdl-welcome-seen', '1')
    } catch {
      /* about:blank 上不可写 */
    }
  })
})

test('主路径：目标 → 地图 → 路径 → 验收 → 复盘', async ({ page, request }) => {
  const created = await request.post('/api/goals', {
    data: { title: goal, kind: '常规' },
  })
  expect(created.ok()).toBe(true)
  const goalId = ((await created.json()) as { goal: { id: string } }).goal.id

  const candidates = await request.post(`/api/goals/${goalId}/map/commit`, {
    data: {
      candidates: [
        { tempId: 'a', title: 'E2E 节点 A' },
        { tempId: 'b', title: 'E2E 节点 B' },
      ],
    },
  })
  expect(candidates.ok()).toBe(true)

  const map = (await (await request.get(`/api/goals/${goalId}/map`)).json()) as {
    nodes: { id: string; title: string }[]
  }
  const nodeA = map.nodes.find((node) => node.title === 'E2E 节点 A')?.id
  const nodeB = map.nodes.find((node) => node.title === 'E2E 节点 B')?.id
  expect(nodeA).toBeTruthy()
  expect(nodeB).toBeTruthy()

  const path = await request.post(`/api/goals/${goalId}/path/commit`, {
    data: {
      stages: [
        {
          tempId: 's1',
          title: 'E2E 第一段',
          estimate: '约 0.5 天',
          nodeIds: [nodeA],
          checks: ['能讲清节点 A 的要点'],
          questions: [
            {
              tempId: 'q1',
              kind: '封闭',
              stem: 'E2E 题一：节点 A 的要点是什么？',
              answer: '要点 A',
              explanation: '因为 A 就是要点',
              nodeId: nodeA,
            },
            {
              tempId: 'q2',
              kind: '开放',
              stem: 'E2E 题二：用自己的话讲清节点 A',
              nodeId: nodeA,
            },
          ],
        },
        {
          tempId: 's2',
          title: 'E2E 第二段',
          estimate: '约 1 天',
          nodeIds: [nodeB],
          checks: ['能讲清节点 B 的要点'],
          questions: [
            {
              tempId: 'q3',
              kind: '封闭',
              stem: 'E2E 题三：节点 B 的要点是什么？',
              answer: '要点 B',
              explanation: '因为 B 就是要点',
              nodeId: nodeB,
            },
          ],
        },
      ],
    },
  })
  expect(path.ok()).toBe(true)

  await page.goto('/map')
  await expect(page.getByText('E2E 节点 A')).toBeVisible()
  await expect(page.getByText('E2E 节点 B')).toBeVisible()

  await page.goto('/path')
  await expect(page.getByText('E2E 第一段')).toBeVisible()
  await expect(page.getByText('E2E 第二段')).toBeVisible()

  await page.goto('/assess')
  await expect(page.getByText(/E2E 题一：节点 A 的要点是什么/)).toBeVisible()
  await page.getByRole('button', { name: '交卷' }).click()
  await expect(page.getByText(/对 0 · 错 0 · 未答 3/)).toBeVisible()

  await page.goto('/retro')
  await expect(page.getByText(/对 0 · 错 0 · 未答 3/)).toBeVisible()
  await page.getByLabel('哪里行（worked）').fill('地图与路径都跑通了')
  await page.getByLabel('哪里卡住（failed）').fill('题目还没答')
  await page.getByLabel('下一步改什么（next_adjustment）').fill('先做题')
  await page.getByRole('button', { name: '写复盘' }).click()
  await expect(page.getByText(/已写复盘/)).toBeVisible()
  await expect(page.getByText('地图与路径都跑通了')).toBeVisible()
})
