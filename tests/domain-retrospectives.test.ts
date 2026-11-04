import { afterEach, describe, expect, it } from 'vitest'
import { recordRecital } from '../src/domain/assessments.js'
import { createGoal } from '../src/domain/goals.js'
import { createNode, requireNode } from '../src/domain/nodes.js'
import { createStage } from '../src/domain/path-stages.js'
import { createQuestion } from '../src/domain/questions.js'
import {
  createRetrospective,
  listAllRetrospectives,
  listRetrospectives,
} from '../src/domain/retrospectives.js'
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
  stageId: string
  assessmentId: string
}

function setup(): Setup {
  const vault = track(createEmptyVault())
  const goal = createGoal({ root: vault, title: '精通 TypeScript 类型系统' })
  const node = createNode({ root: vault, title: '类型基础', goal: goal.id })
  const question = createQuestion({
    root: vault,
    goal: goal.id,
    title: '等价吗',
    kind: '封闭',
    stem: '题干',
    answer: '等价',
    explanation: '解析',
  })
  const stage = createStage({
    root: vault,
    goal: goal.id,
    title: '精读《类型基础》',
    estimate: '约 1 天',
    nodes: [node.id],
    checks: ['能不看笔记说出类型检查发生在编译期'],
    questions: [question.id],
  })
  const assessment = recordRecital({
    root: vault,
    node: node.id,
    text: '类型就是给值的形状立规矩。',
    result: '已完成',
    date: '2026-09-29',
  })

  return { vault, goalId: goal.id, nodeId: node.id, stageId: stage.id, assessmentId: assessment.id }
}

describe('TG7 · 复盘落在目标分区的 复盘/ 里', () => {
  it('三个字段往返一致，并通过 assessment 关联回验收、通过 adjust_events 关联回路径段', () => {
    const { vault, goalId, assessmentId, stageId } = setup()
    const retrospective = createRetrospective({
      root: vault,
      assessment: assessmentId,
      worked: '先复述再做题，能暴露"以为懂了"的地方。',
      failed: '把编译期说成了运行期。',
      nextAdjustment: '下一轮先补泛型再碰条件类型。',
      adjustEvents: [stageId],
      date: '2026-09-29',
    })

    expect(retrospective.relativePath).toContain('20-学习项目')
    expect(retrospective.relativePath).toContain('复盘')
    expect(retrospective.goalId).toBe(goalId)
    expect(retrospective.adjustEventIds).toEqual([stageId])

    const doc = readDocument(vault, retrospective.relativePath)
    expect(doc.data['worked']).toContain('暴露')
    expect(doc.data['next_adjustment']).toContain('先补泛型')
    expect(Array.isArray(doc.data['adjust_events'])).toBe(true)
  })

  it('按目标过滤复盘', () => {
    const { vault, goalId, assessmentId } = setup()
    createRetrospective({
      root: vault,
      assessment: assessmentId,
      worked: 'w',
      failed: 'f',
      nextAdjustment: 'n',
    })

    expect(listAllRetrospectives(vault)).toHaveLength(1)
    expect(listRetrospectives(vault, { goalId })).toHaveLength(1)
    expect(listRetrospectives(vault, { goalId: 'nope' })).toHaveLength(0)
  })
})

describe('TG7 · mastery 由复盘时人工指定', () => {
  it('复盘时明确写出目标值，回写后重新拉取立即生效', () => {
    const { vault, nodeId, assessmentId } = setup()
    expect(requireNode(vault, nodeId).mastery).toBe('未学')

    createRetrospective({
      root: vault,
      assessment: assessmentId,
      worked: 'w',
      failed: 'f',
      nextAdjustment: 'n',
      mastery: '已掌握',
    })

    expect(requireNode(vault, nodeId).mastery).toBe('已掌握')
  })

  it('mastery 取值域之外被拒绝，且不留半条复盘', () => {
    const { vault, assessmentId } = setup()
    expect(
      vaultErrorCode(() =>
        createRetrospective({
          root: vault,
          assessment: assessmentId,
          worked: 'w',
          failed: 'f',
          nextAdjustment: 'n',
          mastery: '精通',
        }),
      ),
    ).toBe('INVALID_INPUT')
    expect(listAllRetrospectives(vault)).toHaveLength(0)
  })

  it('验收结果不会自动改 mastery', () => {
    const { vault, nodeId } = setup()
    expect(requireNode(vault, nodeId).mastery).toBe('未学')
  })
})

describe('TG7 · 复盘入参校验', () => {
  it('assessment 不存在报 NOT_FOUND；adjust_events 指向不存在的段被拒且不写盘', () => {
    const { vault, assessmentId } = setup()

    expect(
      vaultErrorCode(() =>
        createRetrospective({
          root: vault,
          assessment: 'nope',
          worked: 'w',
          failed: 'f',
          nextAdjustment: 'n',
        }),
      ),
    ).toBe('NOT_FOUND')

    expect(
      vaultErrorCode(() =>
        createRetrospective({
          root: vault,
          assessment: assessmentId,
          worked: 'w',
          failed: 'f',
          nextAdjustment: 'n',
          adjustEvents: ['nope'],
        }),
      ),
    ).toBe('NOT_FOUND')
    expect(listAllRetrospectives(vault)).toHaveLength(0)
  })

  it('三字段任一为空即被拒绝', () => {
    const { vault, assessmentId } = setup()
    expect(
      vaultErrorCode(() =>
        createRetrospective({
          root: vault,
          assessment: assessmentId,
          worked: '',
          failed: 'f',
          nextAdjustment: 'n',
        }),
      ),
    ).toBe('INVALID_INPUT')
  })
})
