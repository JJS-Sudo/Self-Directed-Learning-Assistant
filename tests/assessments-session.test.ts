import { afterEach, describe, expect, it } from 'vitest'
import { createGoal } from '../src/domain/goals.js'
import { createNode } from '../src/domain/nodes.js'
import { createQuestion } from '../src/domain/questions.js'
import { submitSession } from '../src/assessments/session.js'
import { suggestOf, summarizeSession } from '../src/assessments/stats.js'
import type { AssessmentSummary } from '../src/domain/assessments.js'
import { createEmptyVault, removeDir } from './helpers.js'

const dirs: string[] = []

function setup() {
  const root = createEmptyVault()
  dirs.push(root)
  const goal = createGoal({ root, title: '验收测试目标' })
  const node = createNode({ root, title: '最小二乘估计', goal: goal.id })
  const other = createNode({ root, title: '高斯-马尔可夫定理', goal: goal.id })

  const questions = [0, 1, 2, 3, 4].map((index) =>
    createQuestion({
      root,
      goal: goal.id,
      title: `题 ${index + 1}`,
      kind: '封闭',
      stem: `第 ${index + 1} 题`,
      answer: '答案',
      explanation: '解析',
      node: index < 3 ? node.id : other.id,
    }),
  )

  return { root, goalId: goal.id, node, other, questions }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDir(dir)
})

describe('交卷记录', () => {
  it('5 题只答 2 题：仍落 5 条记录，未作答 3 条', () => {
    const { root, goalId, questions } = setup()

    const result = submitSession({
      root,
      goalId,
      questionIds: questions.map((question) => question.id),
      answers: [
        { questionId: questions[0]!.id, result: '正确' },
        { questionId: questions[1]!.id, result: '正确' },
      ],
    })

    expect(result.records).toHaveLength(5)
    expect(result.stats.total).toBe(5)
    expect(result.stats.correct).toBe(2)
    expect(result.stats.unanswered).toBe(3)
    expect(result.records.filter((record) => record.result === '未作答')).toHaveLength(3)
  })

  it('复述与做题共享 session，且复述不计入正确率', () => {
    const { root, goalId, questions, node } = setup()

    const result = submitSession({
      root,
      goalId,
      questionIds: [questions[0]!.id],
      answers: [{ questionId: questions[0]!.id, result: '错误' }],
      recitals: [{ nodeId: node.id, text: '我用自己的话讲了一遍', result: '未完成' }],
    })

    expect(result.records).toHaveLength(2)
    expect(result.stats.total).toBe(1)
    expect(result.stats.wrong).toBe(1)
    expect(result.stats.recitalPending).toBe(1)
    expect(result.stats.recitalDone).toBe(0)

    const sessionIds = new Set(result.records.map((record) => record.sessionId))
    expect(sessionIds.size).toBe(1)
  })

  it('复述正文为空：抛 INVALID_INPUT', () => {
    const { root, goalId, questions } = setup()

    expect(() =>
      submitSession({
        root,
        goalId,
        questionIds: [questions[0]!.id],
        recitals: [{ nodeId: 'zzzzzz', text: '', result: '已完成' }],
      }),
    ).toThrowError()
  })

  it('重复的题目 id 只落一条记录', () => {
    const { root, goalId, questions } = setup()

    const result = submitSession({
      root,
      goalId,
      questionIds: [questions[0]!.id, questions[0]!.id],
    })

    expect(result.records).toHaveLength(1)
  })

  it('空题目列表：INVALID_INPUT', () => {
    const { root, goalId } = setup()

    expect(() => submitSession({ root, goalId, questionIds: [] })).toThrowError()
  })

  it('只有复述时：做题统计为空，复述单独计数', () => {
    const { root, goalId, node } = setup()

    const result = submitSession({
      root,
      goalId,
      questionIds: [],
      recitals: [{ nodeId: node.id, text: '讲了一遍', result: '已完成' }],
    })

    expect(result.stats.total).toBe(0)
    expect(result.stats.byNode).toEqual([])
    expect(result.stats.recitalDone).toBe(1)
  })
})

describe('统计与建议', () => {
  function record(mode: string, result: string, nodeId: string): AssessmentSummary {
    return {
      id: 'x',
      title: 'x',
      sessionId: 's',
      nodeId,
      date: '2026-11-01',
      mode,
      result,
      body: '',
      relativePath: 'x.md',
      createdAt: '2026-11-01T00:00:00Z',
    }
  }

  it('按节点聚合正确率，未作答计入分母', () => {
    const stats = summarizeSession([
      record('做题', '正确', 'n1'),
      record('做题', '正确', 'n1'),
      record('做题', '未作答', 'n1'),
      record('做题', '正确', 'n1'),
      record('做题', '正确', 'n1'),
      record('做题', '错误', 'n2'),
    ])

    expect(stats.byNode).toEqual([
      { nodeId: 'n1', total: 5, correct: 4, accuracy: 0.8 },
      { nodeId: 'n2', total: 1, correct: 0, accuracy: 0 },
    ])
    expect(stats.suggestedMastery).toEqual([
      { nodeId: 'n1', mastery: '已掌握' },
      { nodeId: 'n2', mastery: '未学' },
    ])
  })

  it('三档边界：0 → 未学；79% → 在学；80% → 已掌握', () => {
    expect(suggestOf(0)).toBe('未学')
    expect(suggestOf(0.79)).toBe('在学')
    expect(suggestOf(0.8)).toBe('已掌握')
    expect(suggestOf(1)).toBe('已掌握')
  })
})
