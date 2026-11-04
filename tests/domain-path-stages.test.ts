import { afterEach, describe, expect, it } from 'vitest'
import { createGoal } from '../src/domain/goals.js'
import { createNode } from '../src/domain/nodes.js'
import {
  createStage,
  listStages,
  nodesOfStage,
  stagesOfNode,
  vagueChecks,
} from '../src/domain/path-stages.js'
import { createQuestion } from '../src/domain/questions.js'
import { readDocument } from '../src/vault/io.js'
import { createEmptyVault, removeDir, vaultErrorCode } from './helpers.js'

const tempDirs: string[] = []

function track(dir: string): string {
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) removeDir(dir)
})

interface Setup {
  vault: string
  goalId: string
  nodeId: string
}

function setup(): Setup {
  const vault = track(createEmptyVault())
  const goal = createGoal({ root: vault, title: '精通 TypeScript 类型系统' })
  const node = createNode({ root: vault, title: '类型基础', goal: goal.id })
  return { vault, goalId: goal.id, nodeId: node.id }
}

describe('TG3 · PathStage 落在目标分区的 学习路径/ 里', () => {
  it('阶段估时、涉及节点、检验信号都落盘', () => {
    const { vault, goalId, nodeId } = setup()
    const stage = createStage({
      root: vault,
      goal: goalId,
      title: '第一天：把想法变成一句话',
      estimate: '约 0.5 天',
      deliverable: '一句话描述 + 三个功能',
      nodes: [nodeId],
      checks: ['那句话里没有技术名词', '能说出这次不做什么'],
    })

    expect(stage.relativePath).toContain('20-学习项目')
    expect(stage.relativePath).toContain('学习路径')
    expect(stage.order).toBe(1)
    expect(stage.nodeIds).toEqual([nodeId])
    expect(stage.checks).toHaveLength(2)

    const doc = readDocument(vault, stage.relativePath)
    expect(doc.data['estimate']).toBe('约 0.5 天')
    expect(doc.data['type']).toBe('path-stage')
    expect(Array.isArray(doc.data['nodes'])).toBe(true)
    expect(Array.isArray(doc.data['checks'])).toBe(true)
  })

  it('estimate / nodes / checks 任一缺失即被拒绝', () => {
    const { vault, goalId, nodeId } = setup()
    const base = { root: vault, goal: goalId, title: 'x' }

    expect(
      vaultErrorCode(() =>
        createStage({ ...base, estimate: '', nodes: [nodeId], checks: ['能讲清这一段'] }),
      ),
    ).toBe('INVALID_INPUT')
    expect(
      vaultErrorCode(() =>
        createStage({ ...base, estimate: '约 1 天', nodes: [], checks: ['能讲清这一段'] }),
      ),
    ).toBe('INVALID_INPUT')
    expect(
      vaultErrorCode(() =>
        createStage({ ...base, estimate: '约 1 天', nodes: [nodeId], checks: [] }),
      ),
    ).toBe('INVALID_INPUT')
    expect(
      vaultErrorCode(() =>
        createStage({ ...base, estimate: '约 1 天', nodes: [nodeId], checks: ['   '] }),
      ),
    ).toBe('INVALID_INPUT')
  })

  it('节点与题目必须存在、且属于同一目标（跨目标引用被拒）', () => {
    const { vault, goalId, nodeId } = setup()
    const otherGoal = createGoal({ root: vault, title: '另一个目标' })
    const otherNode = createNode({ root: vault, title: '别的节点', goal: otherGoal.id })
    const otherQuestion = createQuestion({
      root: vault,
      goal: otherGoal.id,
      title: '别的题',
      kind: '开放',
      stem: 's',
    })

    const base = {
      root: vault,
      goal: goalId,
      title: 'x',
      estimate: '约 1 天',
      checks: ['能讲清这一段'],
    }

    expect(vaultErrorCode(() => createStage({ ...base, nodes: ['nope'] }))).toBe('NOT_FOUND')
    expect(vaultErrorCode(() => createStage({ ...base, nodes: [otherNode.id] }))).toBe(
      'INVALID_INPUT',
    )
    expect(
      vaultErrorCode(() =>
        createStage({ ...base, nodes: [nodeId], questions: [otherQuestion.id] }),
      ),
    ).toBe('INVALID_INPUT')
    expect(
      vaultErrorCode(() => createStage({ ...base, nodes: [nodeId], questions: ['nope'] })),
    ).toBe('NOT_FOUND')
  })

  it('段序稳定：order 递增、两次拉取一致、不同目标互不干扰', () => {
    const { vault, goalId, nodeId } = setup()
    const otherGoal = createGoal({ root: vault, title: '另一个目标' })
    const otherNode = createNode({ root: vault, title: '别的节点', goal: otherGoal.id })

    const a = createStage({
      root: vault,
      goal: goalId,
      title: 'A',
      estimate: '约 1 天',
      nodes: [nodeId],
      checks: ['能讲清这一段'],
    })
    const b = createStage({
      root: vault,
      goal: goalId,
      title: 'B',
      estimate: '约 2 天',
      nodes: [nodeId],
      checks: ['能讲清这一段'],
    })
    const other = createStage({
      root: vault,
      goal: otherGoal.id,
      title: 'C',
      estimate: '约 3 天',
      nodes: [otherNode.id],
      checks: ['能讲清这一段'],
    })

    expect([a.order, b.order, other.order]).toEqual([1, 2, 1])

    const first = listStages(vault, goalId).map((stage) => stage.id)
    const second = listStages(vault, goalId).map((stage) => stage.id)
    expect(first).toEqual([a.id, b.id])
    expect(first).toEqual(second)
  })
})

describe('TG3 · 路径段与知识节点双向可查', () => {
  it('nodesOfStage 与 stagesOfNode 互为逆运算', () => {
    const { vault, goalId, nodeId } = setup()
    const second = createNode({ root: vault, title: '泛型', goal: goalId })

    const s1 = createStage({
      root: vault,
      goal: goalId,
      title: 'S1',
      estimate: '约 1 天',
      nodes: [nodeId],
      checks: ['能讲清这一段'],
    })
    const s2 = createStage({
      root: vault,
      goal: goalId,
      title: 'S2',
      estimate: '约 2 天',
      nodes: [nodeId, second.id],
      checks: ['能讲清这一段'],
    })

    expect(nodesOfStage(s1)).toEqual([nodeId])
    expect(nodesOfStage(s2)).toEqual([nodeId, second.id])

    expect(stagesOfNode(vault, goalId, nodeId).map((stage) => stage.id)).toEqual([s1.id, s2.id])
    expect(stagesOfNode(vault, goalId, second.id).map((stage) => stage.id)).toEqual([s2.id])

    // 反向一致性：每个节点被哪些段覆盖，等于"nodes 里含该节点的那些段"
    const stages = listStages(vault, goalId)
    for (const node of [nodeId, second.id]) {
      const fromStages = stages.filter((stage) => stage.nodeIds.includes(node)).map((s) => s.id)
      expect(stagesOfNode(vault, goalId, node).map((stage) => stage.id)).toEqual(fromStages)
    }
  })
})

describe('checks 的可判定性', () => {
  it('太短的 check 被领域层拒绝（写不清判据）', () => {
    const { vault, goalId, nodeId } = setup()

    const code = vaultErrorCode(() =>
      createStage({
        root: vault,
        goal: goalId,
        title: 'S',
        estimate: '约 1 天',
        nodes: [nodeId],
        checks: ['能讲清'],
      }),
    )

    expect(code).toBe('INVALID_INPUT')
  })

  it('模糊措辞只被标出来，不阻止落盘', () => {
    const { vault, goalId, nodeId } = setup()

    const stage = createStage({
      root: vault,
      goal: goalId,
      title: 'S',
      estimate: '约 1 天',
      nodes: [nodeId],
      checks: ['了解线性回归', '能画出四层图'],
    })

    expect(stage.checks).toHaveLength(2)
    expect(vagueChecks(stage.checks)).toEqual(['了解线性回归'])
  })
})
