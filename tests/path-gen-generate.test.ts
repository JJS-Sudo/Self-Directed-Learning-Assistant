import { describe, expect, it } from 'vitest'
import type { GoalSummary } from '../src/domain/goals.js'
import type { MapNodeSummary } from '../src/domain/nodes.js'
import { generatePath } from '../src/path-gen/generate.js'
import { completion, fakeFetch, jsonResponse, testConfig } from './llm-fixtures.js'

const goal: GoalSummary = {
  id: 'g1',
  title: '掌握一元线性回归',
  status: '在用',
  kind: '常规',
  successCriteria: '能手算 R²',
  relativePath: '10-目标/g1.md',
  createdAt: '2026-01-01T00:00:00Z',
}

function node(id: string, title: string, upId?: string): MapNodeSummary {
  return {
    id,
    title,
    order: 1,
    mastery: '未学',
    status: '在用',
    relatedIds: [],
    links: [],
    relativePath: `20-学习项目/g1/${id}.md`,
    createdAt: '2026-01-01T00:00:00Z',
    ...(upId === undefined ? {} : { upId }),
  }
}

const nodes = [node('n1', '第一章'), node('n2', '小节 A', 'n1'), node('n3', '小节 B', 'n1')]

function stageJson(nodeIds: string[]): string {
  return JSON.stringify({
    stages: [
      {
        temp_id: 's1',
        title: '第一段',
        estimate: '约 0.5 天',
        node_ids: nodeIds,
        checks: ['能画出两层结构'],
        questions: [
          {
            temp_id: 'q1',
            kind: '封闭',
            stem: 'A 与 B 的区别？',
            answer: '答案',
            explanation: '解析',
            node_id: nodeIds[0],
          },
          { temp_id: 'q2', kind: '开放', stem: '用自己的话讲清这一章', node_id: nodeIds[0] },
        ],
      },
    ],
  })
}

describe('路径生成', () => {
  it('一次覆盖全部叶子：只调用一次，无警告', async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse(completion(stageJson(['n2', 'n3']))))

    const result = await generatePath(testConfig(), goal, nodes, { fetch })

    expect(calls).toHaveLength(1)
    expect(result.calls).toBe(1)
    expect(result.warnings).toEqual([])
    expect(result.stages[0]?.questions).toHaveLength(2)
  })

  it('第一次漏了叶子：带缺口再生成一次并补齐', async () => {
    const { fetch, calls } = fakeFetch((_call, index) =>
      jsonResponse(completion(stageJson(index === 0 ? ['n2'] : ['n2', 'n3']))),
    )

    const result = await generatePath(testConfig(), goal, nodes, { fetch })

    expect(calls).toHaveLength(2)
    expect(result.calls).toBe(2)
    expect(result.warnings).toEqual([])
    expect(result.stages[0]?.nodeIds).toEqual(['n2', 'n3'])

    const secondBody = JSON.parse(String(calls[1]?.init.body)) as {
      messages: { content: string }[]
    }
    expect(secondBody.messages.at(-1)?.content).toContain('漏掉')
  })

  it('两次都漏：给出警告，但不抛错', async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse(completion(stageJson(['n2']))))

    const result = await generatePath(testConfig(), goal, nodes, { fetch })

    expect(calls).toHaveLength(2)
    expect(result.warnings.join('')).toContain('未被任何路径段覆盖')
  })

  it('引用了不存在的节点：LLM_BAD_RESPONSE', async () => {
    const { fetch } = fakeFetch(() => jsonResponse(completion(stageJson(['nope']))))

    await expect(generatePath(testConfig(), goal, nodes, { fetch })).rejects.toMatchObject({
      code: 'LLM_BAD_RESPONSE',
    })
  })

  it('封闭题缺答案：LLM_BAD_RESPONSE', async () => {
    const bad = JSON.stringify({
      stages: [
        {
          temp_id: 's1',
          title: '第一段',
          estimate: '约 1 天',
          node_ids: ['n2'],
          checks: ['能画出两层结构'],
          questions: [{ temp_id: 'q1', kind: '封闭', stem: '题', node_id: 'n2' }],
        },
      ],
    })
    const { fetch } = fakeFetch(() => jsonResponse(completion(bad)))

    await expect(generatePath(testConfig(), goal, nodes, { fetch })).rejects.toMatchObject({
      code: 'LLM_BAD_RESPONSE',
    })
  })

  it('没有节点时不发请求', async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse(completion('{}')))

    await expect(generatePath(testConfig(), goal, [], { fetch })).rejects.toMatchObject({
      code: 'LLM_BAD_INPUT',
    })
    expect(calls).toHaveLength(0)
  })

  it('没有 key 时不发请求', async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse(completion('{}')))

    await expect(
      generatePath(testConfig({ apiKey: '' }), goal, nodes, { fetch }),
    ).rejects.toMatchObject({ code: 'LLM_NOT_CONFIGURED' })
    expect(calls).toHaveLength(0)
  })
})
