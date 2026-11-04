import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { createGoal } from '../src/domain/goals.js'
import { createNode } from '../src/domain/nodes.js'
import { createQuestion } from '../src/domain/questions.js'
import { createEmptyVault, removeDir } from './helpers.js'

const dirs: string[] = []

function setup() {
  const root = createEmptyVault()
  dirs.push(root)
  const goal = createGoal({ root, title: '验收 API 测试' })
  const node = createNode({ root, title: '最小二乘估计', goal: goal.id })
  const questions = [0, 1, 2, 3, 4].map((index) =>
    createQuestion({
      root,
      goal: goal.id,
      title: `题 ${index + 1}`,
      kind: '封闭',
      stem: `第 ${index + 1} 题`,
      answer: '答案',
      explanation: '解析',
      node: node.id,
    }),
  )
  const app = createApp({ vaultPath: root })
  return { root, goalId: goal.id, node, questions, app }
}

function postJson(app: ReturnType<typeof createApp>, path: string, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDir(dir)
})

describe('验收 API', () => {
  it('交卷：5 题答 2 题，落 5 条记录', async () => {
    const { app, goalId, questions } = setup()

    const response = await postJson(app, `/api/goals/${goalId}/assessments`, {
      questionIds: questions.map((question) => question.id),
      answers: [
        { questionId: questions[0]!.id, result: '正确' },
        { questionId: questions[1]!.id, result: '正确' },
      ],
    })
    const body = (await response.json()) as {
      sessionId: string
      records: unknown[]
      stats: { total: number; correct: number; unanswered: number }
    }

    expect(response.status).toBe(200)
    expect(body.records).toHaveLength(5)
    expect(body.stats).toMatchObject({ total: 5, correct: 2, unanswered: 3 })
  })

  it('GET ?session= 返回同一次交卷的记录', async () => {
    const { app, goalId, questions } = setup()
    const submit = await postJson(app, `/api/goals/${goalId}/assessments`, {
      questionIds: [questions[0]!.id, questions[1]!.id],
      answers: [{ questionId: questions[0]!.id, result: '错误' }],
    })
    const sessionId = ((await submit.json()) as { sessionId: string }).sessionId

    const response = await app.request(`/api/goals/${goalId}/assessments?session=${sessionId}`)
    const body = (await response.json()) as { records: { result: string }[] }

    expect(body.records).toHaveLength(2)
    expect(body.records.map((record) => record.result).sort()).toEqual(['未作答', '错误'])
  })

  it('不传 session：返回该目标的记录', async () => {
    const { app, goalId, questions } = setup()
    await postJson(app, `/api/goals/${goalId}/assessments`, {
      questionIds: [questions[0]!.id],
      answers: [{ questionId: questions[0]!.id, result: '正确' }],
    })

    const response = await app.request(`/api/goals/${goalId}/assessments`)
    const body = (await response.json()) as { records: unknown[] }

    expect(body.records).toHaveLength(1)
  })

  it('非法结果值：400', async () => {
    const { app, goalId, questions } = setup()

    const response = await postJson(app, `/api/goals/${goalId}/assessments`, {
      questionIds: [questions[0]!.id],
      answers: [{ questionId: questions[0]!.id, result: '半对' }],
    })

    expect(response.status).toBe(400)
  })

  it('题目列表为空：400', async () => {
    const { app, goalId } = setup()

    const response = await postJson(app, `/api/goals/${goalId}/assessments`, {
      questionIds: [],
    })

    expect(response.status).toBe(400)
  })

  it('题目属于别的目标：400', async () => {
    const { root, app, goalId } = setup()
    const otherGoal = createGoal({ root, title: '另一个目标' })
    const otherNode = createNode({ root, title: '别人的节点', goal: otherGoal.id })
    const otherQuestion = createQuestion({
      root,
      goal: otherGoal.id,
      title: '别人的题',
      kind: '封闭',
      stem: '别的目标的题',
      answer: '答案',
      explanation: '解析',
      node: otherNode.id,
    })

    const response = await postJson(app, `/api/goals/${goalId}/assessments`, {
      questionIds: [otherQuestion.id],
    })

    expect(response.status).toBe(400)
  })

  it('题目不存在：404；目标不存在：404', async () => {
    const { app, goalId } = setup()

    const missingQuestion = await postJson(app, `/api/goals/${goalId}/assessments`, {
      questionIds: ['zzzzzz'],
    })
    const missingGoal = await postJson(app, '/api/goals/zzzzzz/assessments', {
      questionIds: ['zzzzzz'],
    })

    expect(missingQuestion.status).toBe(404)
    expect(missingGoal.status).toBe(404)
  })
})
