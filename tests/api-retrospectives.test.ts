import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { createGoal } from '../src/domain/goals.js'
import { createNode, requireNode } from '../src/domain/nodes.js'
import { createQuestion } from '../src/domain/questions.js'
import { createStage, listStages } from '../src/domain/path-stages.js'
import { createEmptyVault, removeDir } from './helpers.js'

const dirs: string[] = []

function setup() {
  const root = createEmptyVault()
  dirs.push(root)
  const goal = createGoal({ root, title: '复盘 API 测试' })
  const node = createNode({ root, title: '最小二乘估计', goal: goal.id })
  const question = createQuestion({
    root,
    goal: goal.id,
    title: '题一',
    kind: '封闭',
    stem: '最小二乘的准则是什么？',
    answer: '残差平方和最小',
    explanation: '对残差平方和求导令其为零',
    node: node.id,
  })
  const stage1 = createStage({
    root,
    goal: goal.id,
    title: '第一段',
    estimate: '约 0.5 天',
    nodes: [node.id],
    checks: ['能写出最小二乘的准则'],
    order: 1,
  })
  const stage2 = createStage({
    root,
    goal: goal.id,
    title: '第二段',
    estimate: '约 1 天',
    nodes: [node.id],
    checks: ['能推导正规方程'],
    order: 2,
  })
  const app = createApp({ vaultPath: root })
  return { root, goalId: goal.id, node, question, stage1, stage2, app }
}

function postJson(app: ReturnType<typeof createApp>, path: string, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function submitOne(app: ReturnType<typeof createApp>, goalId: string, questionId: string) {
  const response = await postJson(app, `/api/goals/${goalId}/assessments`, {
    questionIds: [questionId],
    answers: [{ questionId, result: '错误' }],
  })
  const body = (await response.json()) as { sessionId: string; records: { id: string }[] }
  return { sessionId: body.sessionId, assessmentId: body.records[0]!.id }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDir(dir)
})

describe('复盘 API', () => {
  it('提交复盘：事件是段 id，mastery 回写，段序不变', async () => {
    const { root, goalId, node, question, stage1, stage2, app } = setup()
    const { assessmentId } = await submitOne(app, goalId, question.id)
    const before = listStages(root, goalId).map((stage) => stage.order)

    const response = await postJson(app, `/api/goals/${goalId}/retrospectives`, {
      assessmentId,
      worked: '读完了最小二乘的几何解释',
      failed: '正规方程推导卡住',
      nextAdjustment: '把第一段拆成两段，先练推导',
      stageIds: [stage1.id, stage2.id],
      mastery: '已掌握',
    })
    const body = (await response.json()) as { id: string; adjustEventIds: string[] }

    expect(response.status).toBe(200)
    expect(body.adjustEventIds).toEqual([stage1.id, stage2.id])
    expect(requireNode(root, node.id).mastery).toBe('已掌握')
    expect(listStages(root, goalId).map((stage) => stage.order)).toEqual(before)
  })

  it('GET 复盘列表带 worked / failed / next_adjustment', async () => {
    const { goalId, question, stage1, app } = setup()
    const { assessmentId } = await submitOne(app, goalId, question.id)
    await postJson(app, `/api/goals/${goalId}/retrospectives`, {
      assessmentId,
      worked: 'A',
      failed: 'B',
      nextAdjustment: 'C',
      stageIds: [stage1.id],
    })

    const response = await app.request(`/api/goals/${goalId}/retrospectives`)
    const body = (await response.json()) as {
      retrospectives: { worked: string; adjustEventIds: string[] }[]
    }

    expect(body.retrospectives).toHaveLength(1)
    expect(body.retrospectives[0]?.worked).toBe('A')
    expect(body.retrospectives[0]?.adjustEventIds).toEqual([stage1.id])
  })

  it('stageIds 里有不存在的段：404', async () => {
    const { goalId, question, app } = setup()
    const { assessmentId } = await submitOne(app, goalId, question.id)

    const response = await postJson(app, `/api/goals/${goalId}/retrospectives`, {
      assessmentId,
      worked: 'A',
      failed: 'B',
      nextAdjustment: 'C',
      stageIds: ['zzzzzz'],
    })

    expect(response.status).toBe(404)
  })

  it('mastery 不在词表：400', async () => {
    const { goalId, question, app } = setup()
    const { assessmentId } = await submitOne(app, goalId, question.id)

    const response = await postJson(app, `/api/goals/${goalId}/retrospectives`, {
      assessmentId,
      worked: 'A',
      failed: 'B',
      nextAdjustment: 'C',
      mastery: '精通',
    })

    expect(response.status).toBe(400)
  })

  it('缺少 worked：400', async () => {
    const { goalId, question, app } = setup()
    const { assessmentId } = await submitOne(app, goalId, question.id)

    const response = await postJson(app, `/api/goals/${goalId}/retrospectives`, {
      assessmentId,
      failed: 'B',
      nextAdjustment: 'C',
    })

    expect(response.status).toBe(400)
  })

  it('验收记录不属于该目标：400', async () => {
    const { root, goalId, question, app } = setup()
    const { assessmentId } = await submitOne(app, goalId, question.id)
    const otherGoal = createGoal({ root, title: '另一个目标' })

    const response = await postJson(app, `/api/goals/${otherGoal.id}/retrospectives`, {
      assessmentId,
      worked: 'A',
      failed: 'B',
      nextAdjustment: 'C',
    })

    expect(response.status).toBe(400)
  })
})
