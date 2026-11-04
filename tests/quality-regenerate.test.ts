import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { createGoal } from '../src/domain/goals.js'
import { createNode, listNodes } from '../src/domain/nodes.js'
import { regenerateNodes } from '../src/quality/regenerate.js'
import { buildQualityReport } from '../src/quality/panel.js'
import { completion, fakeFetch, jsonResponse, testConfig } from './llm-fixtures.js'
import { createEmptyVault, removeDir } from './helpers.js'

const dirs: string[] = []

function setup() {
  const root = createEmptyVault()
  dirs.push(root)
  const goal = createGoal({ root, title: '重生成测试' })
  const a = createNode({ root, title: '节点 A', goal: goal.id })
  const b = createNode({ root, title: '节点 B', goal: goal.id })
  const c = createNode({ root, title: '节点 C', goal: goal.id })
  return { root, goal, a, b, c }
}

function nodesOf(root: string, goalId: string) {
  return listNodes(root, goalId)
}

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDir(dir)
})

describe('子图重生成', () => {
  it('提示词只含选中的节点，并为候选带上父节点与费用', async () => {
    const { root, goal, a } = setup()
    const nodes = await nodesOf(root, goal.id)
    const { fetch, calls } = fakeFetch(() =>
      jsonResponse(
        completion(JSON.stringify({ candidates: [{ title: '修好的 A', parent_node_id: a.id }] })),
      ),
    )

    const result = await regenerateNodes(testConfig(), goal, nodes, [a.id], { fetch })
    const body = JSON.parse(String(calls[0]?.init.body)) as {
      messages: { content: string }[]
    }
    const prompt = body.messages.map((message) => message.content).join('\n')

    expect(prompt).toContain(a.id)
    expect(prompt).toContain('节点 A')
    expect(prompt).not.toContain('节点 B')
    expect(result.candidates[0]).toMatchObject({ title: '修好的 A', parentNodeId: a.id })
    expect(result.warnings).toEqual([])
  })

  it('父节点不在选中范围：丢弃并警告', async () => {
    const { root, goal, a, c } = setup()
    const nodes = await nodesOf(root, goal.id)
    const { fetch } = fakeFetch(() =>
      jsonResponse(
        completion(JSON.stringify({ candidates: [{ title: 'A', parent_node_id: c.id }] })),
      ),
    )

    const result = await regenerateNodes(testConfig(), goal, nodes, [a.id], { fetch })

    expect(result.candidates[0]?.parentNodeId).toBeUndefined()
    expect(result.warnings.join('')).toContain('不在选中范围')
  })

  it('节点不属于该目标：LLM_BAD_INPUT', async () => {
    const { root, goal } = setup()
    const nodes = await nodesOf(root, goal.id)

    await expect(
      regenerateNodes(testConfig(), goal, nodes, ['zzzzzz'], {
        fetch: fakeFetch(() => new Response()).fetch,
      }),
    ).rejects.toMatchObject({ code: 'LLM_BAD_INPUT' })
  })

  it('超过 10 个节点：LLM_BAD_INPUT', async () => {
    const { root, goal } = setup()
    const nodes = await nodesOf(root, goal.id)

    await expect(
      regenerateNodes(
        testConfig(),
        goal,
        nodes,
        Array.from({ length: 11 }, (_, index) => `n${index}`),
        { fetch: fakeFetch(() => new Response()).fetch },
      ),
    ).rejects.toMatchObject({ code: 'LLM_BAD_INPUT' })
  })

  it('API：成功时写入一条 run，失败原因可被面板读到', async () => {
    const { root, goal, a } = setup()
    const { fetch } = fakeFetch((_call, index) =>
      index === 0
        ? jsonResponse(completion(JSON.stringify({ candidates: [{ title: '修好的 A' }] })))
        : jsonResponse(completion('{}'), 500),
    )
    const app = createApp({
      vaultPath: root,
      env: { DEEPSEEK_API_KEY: 'sk-test' },
      llmDeps: { fetch, sleep: async () => undefined },
    })

    const response = await app.request(`/api/goals/${goal.id}/regenerate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nodeIds: [a.id] }),
    })
    expect(response.status).toBe(200)

    const report = buildQualityReport(root, goal)
    expect(report.runs.length).toBeGreaterThan(0)
    expect(report.runs[0]?.kind).toBe('重生成')
  })
})
