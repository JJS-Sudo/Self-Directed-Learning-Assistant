import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { createGoal } from '../src/domain/goals.js'
import { createNode } from '../src/domain/nodes.js'
import { listStages } from '../src/domain/path-stages.js'
import { completion, fakeFetch, jsonResponse } from './llm-fixtures.js'
import { createEmptyVault, removeDir } from './helpers.js'

const dirs: string[] = []

function setup(env: NodeJS.ProcessEnv = {}, fetchImpl?: typeof fetch) {
  const root = createEmptyVault()
  dirs.push(root)
  const goal = createGoal({ root, title: '路径 API 测试' })
  const a = createNode({ root, title: '第一章', goal: goal.id })
  const b = createNode({ root, title: '小节 A', goal: goal.id, up: a.id })
  const c = createNode({ root, title: '小节 B', goal: goal.id, up: a.id })
  const otherGoal = createGoal({ root, title: '另一个目标' })
  const otherNode = createNode({ root, title: '别人的节点', goal: otherGoal.id })
  const app = createApp({
    vaultPath: root,
    env,
    ...(fetchImpl === undefined
      ? {}
      : { llmDeps: { fetch: fetchImpl, sleep: async () => undefined } }),
  })
  return { root, goalId: goal.id, nodes: { a, b, c, other: otherNode }, app }
}

function postJson(app: ReturnType<typeof createApp>, path: string, body: unknown = {}) {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const stageJson = JSON.stringify({
  stages: [
    {
      temp_id: 's1',
      title: '第一段',
      estimate: '约 0.5 天',
      node_ids: ['NODE_B', 'NODE_C'],
      checks: ['能画出两层结构并说明理由'],
      questions: [
        {
          temp_id: 'q1',
          kind: '封闭',
          stem: 'A 与 B 的区别？',
          answer: '答案',
          explanation: '解析',
          node_id: 'NODE_B',
        },
        { temp_id: 'q2', kind: '开放', stem: '用自己的话讲清这一章', node_id: 'NODE_B' },
      ],
    },
  ],
})

function commitBody(nodeB: string, nodeC: string) {
  return {
    stages: [
      {
        tempId: 's1',
        title: '第一段',
        estimate: '约 0.5 天',
        nodeIds: [nodeB, nodeC],
        checks: ['能画出两层结构并说明理由'],
        questions: [
          {
            tempId: 'q1',
            kind: '封闭',
            stem: 'A 与 B 的区别？',
            answer: '答案',
            explanation: '解析',
            nodeId: nodeB,
          },
          { tempId: 'q2', kind: '开放', stem: '用自己的话讲清这一章', nodeId: nodeB },
        ],
      },
    ],
  }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDir(dir)
})

describe('路径 API', () => {
  it('estimate 不发请求，只按节点数估算', async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse(completion('{}')))
    const { app, goalId } = setup({}, fetch)

    const response = await postJson(app, `/api/goals/${goalId}/path/estimate`)
    const body = (await response.json()) as { nodes: number; leaves: number; stages: number }

    expect(response.status).toBe(200)
    expect(body.nodes).toBe(3)
    expect(body.leaves).toBe(2)
    expect(body.stages).toBeGreaterThan(0)
    expect(calls).toHaveLength(0)
  })

  it('无 key：preview 503，且不写盘', async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse(completion('{}')))
    const { root, app, goalId } = setup({}, fetch)

    const response = await postJson(app, `/api/goals/${goalId}/path/preview`)

    expect(response.status).toBe(503)
    expect(calls).toHaveLength(0)
    expect(listStages(root, goalId)).toHaveLength(0)
  })

  it('preview 返回候选但不落盘', async () => {
    const { root, app, goalId, nodes } = setup(
      { DEEPSEEK_API_KEY: 'sk-test-key' },
      fakeFetch(() =>
        jsonResponse(
          completion(stageJson.replaceAll('NODE_B', nodes.b.id).replaceAll('NODE_C', nodes.c.id)),
        ),
      ).fetch,
    )

    const response = await postJson(app, `/api/goals/${goalId}/path/preview`)
    const body = (await response.json()) as { stages: { title: string }[]; warnings: string[] }

    expect(response.status).toBe(200)
    expect(body.stages).toHaveLength(1)
    expect(body.warnings).toEqual([])
    expect(listStages(root, goalId)).toHaveLength(0)
  })

  it('commit 落盘后 GET 能读到段与题', async () => {
    const { root, app, goalId, nodes } = setup()

    const commit = await postJson(
      app,
      `/api/goals/${goalId}/path/commit`,
      commitBody(nodes.b.id, nodes.c.id),
    )
    const body = (await commit.json()) as { createdStages: number; createdQuestions: number }

    expect(commit.status).toBe(200)
    expect(body.createdStages).toBe(1)
    expect(body.createdQuestions).toBe(2)

    const path = await app.request(`/api/goals/${goalId}/path`)
    const pathBody = (await path.json()) as {
      stages: { order: number; nodeIds: string[]; questionIds: string[] }[]
      questions: { kind: string }[]
    }

    expect(pathBody.stages).toHaveLength(1)
    expect(pathBody.stages[0]?.nodeIds).toEqual([nodes.b.id, nodes.c.id])
    expect(pathBody.stages[0]?.questionIds).toHaveLength(2)
    const kinds = pathBody.questions.map((question) => question.kind)
    expect(kinds.filter((kind) => kind === '封闭')).toHaveLength(1)
    expect(kinds.filter((kind) => kind === '开放')).toHaveLength(1)
    expect(listStages(root, goalId)).toHaveLength(1)
  })

  it('封闭题缺答案：400', async () => {
    const { app, goalId, nodes } = setup()
    const body = commitBody(nodes.b.id, nodes.c.id)
    delete (body.stages[0]?.questions[0] as { answer?: string }).answer

    const response = await postJson(app, `/api/goals/${goalId}/path/commit`, body)

    expect(response.status).toBe(400)
  })

  it('引用别的目标的节点：400', async () => {
    const { app, goalId, nodes } = setup()

    const response = await postJson(
      app,
      `/api/goals/${goalId}/path/commit`,
      commitBody(nodes.other.id, nodes.other.id),
    )

    expect(response.status).toBe(400)
  })

  it('引用不存在的节点：404', async () => {
    const { app, goalId } = setup()

    const response = await postJson(
      app,
      `/api/goals/${goalId}/path/commit`,
      commitBody('zzzzzz', 'yyyyyy'),
    )

    expect(response.status).toBe(404)
  })

  it('目标不存在：四个接口都是 404', async () => {
    const { app } = setup()

    const responses = [
      await postJson(app, '/api/goals/zzzzzz/path/estimate'),
      await postJson(app, '/api/goals/zzzzzz/path/preview'),
      await postJson(app, '/api/goals/zzzzzz/path/commit', {}),
      await app.request('/api/goals/zzzzzz/path'),
    ]

    for (const response of responses) expect(response.status).toBe(404)
  })
})
