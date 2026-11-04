import { afterEach, describe, expect, it } from 'vitest'
import {
  listAssessments,
  listSession,
  recordQuiz,
  recordRecital,
  recordSession,
  requireAssessment,
} from '../src/domain/assessments.js'
import { createGoal } from '../src/domain/goals.js'
import { createNode } from '../src/domain/nodes.js'
import { createQuestion } from '../src/domain/questions.js'
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
  questionId: string
}

function setup(): Setup {
  const vault = track(createEmptyVault())
  const goal = createGoal({ root: vault, title: '精通 TypeScript 类型系统' })
  const node = createNode({ root: vault, title: '类型基础', goal: goal.id })
  const question = createQuestion({
    root: vault,
    goal: goal.id,
    title: 'Array 与 T 数组写法是否等价',
    kind: '封闭',
    stem: 'Array<T> 与 T[] 是否等价？',
    answer: '等价',
    explanation: '两者都表示元素类型为 T 的数组。',
    node: node.id,
  })
  return { vault, goalId: goal.id, nodeId: node.id, questionId: question.id }
}

describe('TG6 · 费曼复述', () => {
  it('正文写进受管区块，frontmatter 关联目标与节点，且不带 question', () => {
    const { vault, goalId, nodeId } = setup()
    const recital = recordRecital({
      root: vault,
      node: nodeId,
      text: '用大白话讲一遍：类型就是给值的形状立规矩。',
      result: '已完成',
      date: '2026-09-29',
    })

    expect(recital.relativePath).toContain('20-学习项目')
    expect(recital.relativePath).toContain('验收')
    expect(recital.mode).toBe('复述')
    expect(recital.goalId).toBe(goalId)

    const doc = readDocument(vault, recital.relativePath)
    expect(doc.data['mode']).toBe('复述')
    expect(typeof doc.data['date']).toBe('string')
    expect('question' in doc.data).toBe(false)
    expect('status' in doc.data).toBe(false)
    expect(extractManagedBlock(doc.content)).toContain('类型就是给值的形状立规矩')
  })

  it('result 取值域之外被拒绝', () => {
    const { vault, nodeId } = setup()
    expect(
      vaultErrorCode(() => recordRecital({ root: vault, node: nodeId, text: 'x', result: '正确' })),
    ).toBe('INVALID_INPUT')
  })
})

describe('TG6 · 做题记录', () => {
  it('必须带 question；未作答也要落一条记录', () => {
    const { vault, nodeId, questionId } = setup()

    const correct = recordQuiz({
      root: vault,
      node: nodeId,
      question: questionId,
      result: '正确',
      date: '2026-09-29',
    })
    const blank = recordQuiz({
      root: vault,
      node: nodeId,
      question: questionId,
      result: '未作答',
      date: '2026-09-29',
    })

    expect(correct.questionId).toBe(questionId)
    expect(blank.result).toBe('未作答')
    expect(listAssessments(vault).map((item) => item.result)).toContain('未作答')
  })

  it('result 取值域之外、题目不存在都被拒绝', () => {
    const { vault, nodeId, questionId } = setup()

    expect(
      vaultErrorCode(() =>
        recordQuiz({ root: vault, node: nodeId, question: questionId, result: '已完成' }),
      ),
    ).toBe('INVALID_INPUT')

    expect(
      vaultErrorCode(() =>
        recordQuiz({ root: vault, node: nodeId, question: 'nope', result: '正确' }),
      ),
    ).toBe('NOT_FOUND')
  })
})

describe('TG6 · 一次验收共享 session_id', () => {
  it('复述与做题共享同一 session_id，按 created_at 排序稳定', () => {
    const { vault, nodeId, questionId } = setup()
    const session = recordSession({
      root: vault,
      node: nodeId,
      date: '2026-09-29',
      recital: { text: '先复述一遍。', result: '已完成' },
      quiz: { question: questionId, result: '错误' },
    })

    expect(session.assessments).toHaveLength(2)
    expect(new Set(session.assessments.map((item) => item.sessionId)).size).toBe(1)
    expect(listSession(vault, session.sessionId)).toHaveLength(2)

    const keys = listAssessments(vault).map((item) => `${item.createdAt}|${item.id}`)
    expect(keys).toEqual([...keys].sort())
  })

  it('两次单独的记录各自一个新 session；空验收被拒绝', () => {
    const { vault, nodeId, questionId } = setup()
    const one = recordRecital({ root: vault, node: nodeId, text: 'a', result: '已完成' })
    const two = recordQuiz({ root: vault, node: nodeId, question: questionId, result: '正确' })

    expect(one.sessionId).not.toBe(two.sessionId)
    expect(vaultErrorCode(() => recordSession({ root: vault, node: nodeId }))).toBe('INVALID_INPUT')
    expect(vaultErrorCode(() => requireAssessment(vault, 'nope'))).toBe('NOT_FOUND')
  })
})
