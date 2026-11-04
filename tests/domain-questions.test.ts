import { afterEach, describe, expect, it } from 'vitest'
import { createGoal } from '../src/domain/goals.js'
import { createNode } from '../src/domain/nodes.js'
import {
  createQuestion,
  listQuestions,
  listQuestionsOfNode,
  requireQuestion,
} from '../src/domain/questions.js'
import { extractManagedBlock } from '../src/vault/document.js'
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
  const node = createNode({ root: vault, title: '泛型', goal: goal.id })
  return { vault, goalId: goal.id, nodeId: node.id }
}

describe('TG5 · 题目落在目标分区的 验收/ 里', () => {
  it('封闭题三项齐全时成功落盘，解析写在正文受管区块', () => {
    const { vault, goalId, nodeId } = setup()
    const question = createQuestion({
      root: vault,
      goal: goalId,
      title: 'Array 与 T 数组写法是否等价',
      kind: '封闭',
      stem: '在类型层面，`Array<T>` 与 `T[]` 是否等价？',
      answer: '等价',
      explanation: '两者都表示「元素类型为 T 的数组」。',
      node: nodeId,
    })

    // 落在目标分区里：20-学习项目/<目标>/验收/
    expect(question.relativePath).toContain('20-学习项目')
    expect(question.relativePath).toContain('验收')
    expect(question.goalId).toBe(goalId)

    const doc = readDocument(vault, question.relativePath)
    expect(doc.data['kind']).toBe('封闭')
    expect(doc.data['answer']).toBe('等价')
    expect('explanation' in doc.data).toBe(false)
    expect(extractManagedBlock(doc.content)).toContain('元素类型为 T 的数组')
  })

  it('封闭题缺题干 / 答案 / 解析，任一即被拒绝', () => {
    const { vault, goalId } = setup()
    const bad = (input: { kind: string; stem: string; answer?: string; explanation?: string }) =>
      vaultErrorCode(() => createQuestion({ root: vault, goal: goalId, title: 'x', ...input }))

    expect(bad({ kind: '封闭', stem: '', answer: 'a', explanation: 'e' })).toBe('INVALID_INPUT')
    expect(bad({ kind: '封闭', stem: 's', explanation: 'e' })).toBe('INVALID_INPUT')
    expect(bad({ kind: '封闭', stem: 's', answer: 'a' })).toBe('INVALID_INPUT')
  })

  it('开放题允许缺答案与解析，但题干仍必需；kind 取值域外被拒', () => {
    const { vault, goalId } = setup()
    const open = createQuestion({
      root: vault,
      goal: goalId,
      title: '何时用条件类型',
      kind: '开放',
      stem: '请说明你在什么情况下会优先使用条件类型。',
    })
    expect(open.answer).toBeUndefined()
    expect(open.explanation).toBeUndefined()

    expect(
      vaultErrorCode(() =>
        createQuestion({ root: vault, goal: goalId, title: 'x', kind: '开放', stem: '' }),
      ),
    ).toBe('INVALID_INPUT')

    expect(
      vaultErrorCode(() =>
        createQuestion({
          root: vault,
          goal: goalId,
          title: 'x',
          kind: '填空',
          stem: 's',
          answer: 'a',
          explanation: 'e',
        }),
      ),
    ).toBe('INVALID_INPUT')
  })

  it('node 可选；指定了就必须存在且属于同一目标', () => {
    const { vault, goalId, nodeId } = setup()
    const otherGoal = createGoal({ root: vault, title: '另一个目标' })
    const otherNode = createNode({ root: vault, title: '别的节点', goal: otherGoal.id })

    const noNode = createQuestion({
      root: vault,
      goal: goalId,
      title: '不挂节点',
      kind: '开放',
      stem: '随便问问',
    })
    expect(noNode.nodeId).toBeUndefined()

    expect(
      vaultErrorCode(() =>
        createQuestion({
          root: vault,
          goal: goalId,
          title: 'x',
          kind: '开放',
          stem: 's',
          node: otherNode.id,
        }),
      ),
    ).toBe('INVALID_INPUT')

    expect(listQuestionsOfNode(vault, goalId, nodeId)).toHaveLength(0)
    expect(vaultErrorCode(() => requireQuestion(vault, 'nope'))).toBe('NOT_FOUND')
  })

  it('列出某个目标的题目，别的目标不混进来', () => {
    const { vault, goalId, nodeId } = setup()
    const otherGoal = createGoal({ root: vault, title: '另一个目标' })

    createQuestion({
      root: vault,
      goal: goalId,
      title: 'A',
      kind: '开放',
      stem: 's1',
      node: nodeId,
    })
    createQuestion({ root: vault, goal: otherGoal.id, title: 'B', kind: '开放', stem: 's2' })

    expect(listQuestions(vault, goalId).map((item) => item.title)).toEqual(['A'])
    expect(listQuestions(vault, otherGoal.id).map((item) => item.title)).toEqual(['B'])
  })
})
