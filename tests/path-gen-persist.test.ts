import { afterEach, describe, expect, it } from 'vitest'
import { createGoal } from '../src/domain/goals.js'
import { createNode } from '../src/domain/nodes.js'
import { createStage, listStages } from '../src/domain/path-stages.js'
import { listQuestions } from '../src/domain/questions.js'
import { persistPath } from '../src/path-gen/persist.js'
import type { GeneratedStage } from '../src/path-gen/types.js'
import { createEmptyVault, removeDir } from './helpers.js'

const dirs: string[] = []

function setup() {
  const root = createEmptyVault()
  dirs.push(root)
  const goal = createGoal({ root, title: '路径落盘测试' })
  const a = createNode({ root, title: '第一章', goal: goal.id })
  const b = createNode({ root, title: '小节 A', goal: goal.id, up: a.id })
  const c = createNode({ root, title: '小节 B', goal: goal.id, up: a.id })
  return { root, goalId: goal.id, nodes: { a, b, c } }
}

function stage(tempId: string, nodeId: string, title: string): GeneratedStage {
  return {
    tempId,
    title,
    estimate: '约 0.5 天',
    nodeIds: [nodeId],
    checks: ['能画出两层结构并说明理由'],
    questions: [
      {
        tempId: `${tempId}-q1`,
        kind: '封闭',
        stem: 'A 与 B 的区别？',
        answer: '答案',
        explanation: '解析写在这里',
        nodeId,
      },
      { tempId: `${tempId}-q2`, kind: '开放', stem: '用自己的话讲清这一段', nodeId },
    ],
  }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDir(dir)
})

describe('路径落盘', () => {
  it('先题后段：段与题都写入，且绑定关系正确', () => {
    const { root, goalId, nodes } = setup()

    const result = persistPath(root, goalId, [
      stage('s1', nodes.b.id, '第一段'),
      stage('s2', nodes.c.id, '第二段'),
    ])

    expect(result.createdStages).toBe(2)
    expect(result.createdQuestions).toBe(4)
    expect(result.warnings).toEqual([])

    const stages = listStages(root, goalId)
    expect(stages.map((item) => item.order)).toEqual([1, 2])
    expect(stages.every((item) => item.questionIds.length === 2)).toBe(true)

    const questions = listQuestions(root, goalId)
    const kinds = questions.map((item) => item.kind)
    expect(kinds.filter((kind) => kind === '封闭')).toHaveLength(2)
    expect(kinds.filter((kind) => kind === '开放')).toHaveLength(2)
  })

  it('已有段时只追加，order 接在最大值之后', () => {
    const { root, goalId, nodes } = setup()
    createStage({
      root,
      goal: goalId,
      title: '旧段',
      estimate: '约 1 天',
      nodes: [nodes.a.id],
      checks: ['能讲清整体结构'],
      order: 5,
    })

    persistPath(root, goalId, [stage('s1', nodes.b.id, '新段')])

    const stages = listStages(root, goalId)
    expect(stages.map((item) => item.title)).toEqual(['旧段', '新段'])
    expect(stages.map((item) => item.order)).toEqual([5, 6])
  })

  it('引用不存在的节点：整批拒绝', () => {
    const { root, goalId } = setup()

    expect(() => persistPath(root, goalId, [stage('s1', 'nope', '坏段')])).toThrowError(
      /节点不存在/,
    )
    expect(listStages(root, goalId)).toHaveLength(0)
  })

  it('checks 太短时领域层拒绝（不会落盘）', () => {
    const { root, goalId, nodes } = setup()
    const bad = stage('s1', nodes.b.id, '坏段')
    bad.checks = ['能讲清']

    expect(() => persistPath(root, goalId, [bad])).toThrowError(/checks 太短/)
    expect(listStages(root, goalId)).toHaveLength(0)
  })
})
