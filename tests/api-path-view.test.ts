import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { createGoal } from '../src/domain/goals.js'
import { createNode } from '../src/domain/nodes.js'
import { createResource, findResource } from '../src/domain/resources.js'
import { createStage } from '../src/domain/path-stages.js'
import { createEmptyVault, removeDir } from './helpers.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDir(dir)
})

describe('路径视图：阶段资源与题目', () => {
  it('资源按阶段节点关联，并带平台与价格', async () => {
    const root = createEmptyVault()
    dirs.push(root)
    const goal = createGoal({ root, title: '路径视图' })
    const node = createNode({ root, title: 'Pandas 入门', goal: goal.id })
    const resource = createResource({
      root,
      title: 'Pandas 数据分析入门',
      node: node.id,
      media: '视频',
      level: '入门',
      url: 'https://example.com/pandas',
      durationMin: 96,
      platform: 'B站',
      price: '免费',
    })
    createStage({
      root,
      goal: goal.id,
      title: '第一步',
      estimate: '约 2 小时',
      nodes: [node.id],
      checks: ['能说清 DataFrame 是什么'],
      deliverable: '一个能跑通的环境',
      order: 1,
    })

    const stored = findResource(root, resource.id)
    expect(stored?.platform).toBe('B站')
    expect(stored?.price).toBe('免费')

    const app = createApp({ vaultPath: root })
    const response = await app.request(`/api/goals/${goal.id}/path`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      stages: {
        deliverable?: string
        resources: { title: string; url?: string; platform?: string; price?: string }[]
        questions: unknown[]
      }[]
    }

    const stage = body.stages[0]
    expect(stage?.deliverable).toBe('一个能跑通的环境')
    expect(stage?.questions).toEqual([])
    expect(stage?.resources).toHaveLength(1)
    expect(stage?.resources[0]).toMatchObject({
      title: 'Pandas 数据分析入门',
      url: 'https://example.com/pandas',
      platform: 'B站',
      price: '免费',
    })
  })
})
