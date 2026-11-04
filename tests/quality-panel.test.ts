import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { createGoal, requireGoal, setGoalBudget } from '../src/domain/goals.js'
import { createNode } from '../src/domain/nodes.js'
import { appendRun } from '../src/runs/store.js'
import { buildQualityReport, categorize } from '../src/quality/panel.js'
import { createEmptyVault, removeDir } from './helpers.js'

const dirs: string[] = []

function setup() {
  const root = createEmptyVault()
  dirs.push(root)
  const goal = createGoal({ root, title: '质量面板测试' })
  createNode({ root, title: '最小二乘估计', goal: goal.id })
  const app = createApp({ vaultPath: root })
  return { root, goalId: goal.id, app }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDir(dir)
})

describe('四类警告归类', () => {
  it('按消息归到 地图 / 路径 / 资源', () => {
    expect(categorize('没有被任何路径段覆盖的叶子节点：甲')).toBe('地图')
    expect(categorize('路径段引用了不存在的节点：乙')).toBe('路径')
    expect(categorize('资源没有被任何路径段使用：丙')).toBe('资源')
    expect(categorize('资源挂在不存在的节点上：丁')).toBe('资源')
  })
})

describe('质量报告', () => {
  it('把覆盖警告归组，并汇总失败与费用', () => {
    const { root, goalId } = setup()
    appendRun(root, { at: 't1', goalId, kind: '地图', ok: true, costCny: 3 })
    appendRun(root, { at: 't2', goalId, kind: '路径', ok: false, error: '模型超时' })

    const goal = requireGoal(root, goalId)
    const report = buildQualityReport(root, goal)

    expect(report.warnings.some((warning) => warning.category === '地图')).toBe(true)
    expect(report.failures).toHaveLength(1)
    expect(report.failures[0]?.error).toBe('模型超时')
    expect(report.runs).toHaveLength(2)
    expect(report.budget.spentCny).toBe(3)
    expect(report.budget.over).toBe(false)
  })

  it('超预算：over 为 true，但不影响读取', () => {
    const { root, goalId } = setup()
    setGoalBudget(root, goalId, 1)
    appendRun(root, { at: 't1', goalId, kind: '地图', ok: true, costCny: 3 })

    const report = buildQualityReport(root, requireGoal(root, goalId))
    expect(report.budget).toMatchObject({ budgetCny: 1, spentCny: 3, over: true })
  })
})

describe('质量 API', () => {
  it('GET quality：返回警告与预算', async () => {
    const { app, goalId } = setup()

    const response = await app.request(`/api/goals/${goalId}/quality`)
    const body = (await response.json()) as { warnings: unknown[]; budget: { spentCny: number } }

    expect(response.status).toBe(200)
    expect(body.warnings.length).toBeGreaterThan(0)
    expect(body.budget.spentCny).toBe(0)
  })

  it('POST budget：设置、清除、非法值 400', async () => {
    const { app, goalId } = setup()
    const post = (body: unknown) =>
      app.request(`/api/goals/${goalId}/budget`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })

    expect((await post({ budgetCny: 1 })).status).toBe(200)
    const set = await app.request(`/api/goals/${goalId}/quality`)
    expect(((await set.json()) as { budget: { budgetCny?: number } }).budget.budgetCny).toBe(1)

    expect((await post({ budgetCny: null })).status).toBe(200)
    expect((await post({ budgetCny: -1 })).status).toBe(400)
  })
})
