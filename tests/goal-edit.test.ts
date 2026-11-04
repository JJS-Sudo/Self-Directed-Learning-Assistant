import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createGoal, requireGoal, updateGoal } from '../src/domain/goals.js'
import { createNode } from '../src/domain/nodes.js'
import { findAreaName } from '../src/vault/goal-areas.js'
import { createEmptyVault, removeDir, vaultErrorCode } from './helpers.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDir(dir)
})

function setup() {
  const root = createEmptyVault()
  dirs.push(root)
  const goal = createGoal({ root, title: '一天学会定语从句' })
  const node = createNode({ root, title: '定语从句定义', goal: goal.id })
  return { root, goal, node }
}

describe('目标编辑', () => {
  it('改标题时目标文件与分区目录同步改名，id 不变', () => {
    const { root, goal, node } = setup()
    const oldArea = findAreaName(root, goal.id)
    expect(oldArea).toBeDefined()

    const updated = updateGoal(root, goal.id, { title: '两天吃透定语从句' })

    expect(updated.id).toBe(goal.id)
    expect(updated.title).toBe('两天吃透定语从句')
    expect(existsSync(join(root, goal.relativePath))).toBe(false)
    expect(existsSync(join(root, updated.relativePath))).toBe(true)
    expect(findAreaName(root, goal.id)).toContain('两天吃透定语从句')
    expect(updated.relativePath).not.toBe(goal.relativePath)
    expect(node.id).not.toBe('')
  })

  it('改判据/状态/期限后写回，并刷新 updated_at', () => {
    const { root, goal } = setup()
    const updated = updateGoal(root, goal.id, {
      successCriteria: '能独立分析五个句子',
      status: '暂停',
      deadline: '2026-12-31',
      kind: '激励性',
    })

    expect(updated.successCriteria).toBe('能独立分析五个句子')
    expect(updated.status).toBe('暂停')
    expect(updated.kind).toBe('激励性')
    expect(updated.deadline).toBe('2026-12-31')
    expect(updated.updatedAt).toBeDefined()
    expect(updated.updatedAt).not.toBe('')
  })

  it('清空成功判据与期限后字段消失', () => {
    const { root, goal } = setup()
    updateGoal(root, goal.id, { successCriteria: '先写一个判据', deadline: '2026-12-31' })
    const cleared = updateGoal(root, goal.id, { successCriteria: null, deadline: null })

    expect(cleared.successCriteria).toBeUndefined()
    expect(cleared.deadline).toBeUndefined()
    const content = readFileSync(join(root, cleared.relativePath), 'utf8')
    expect(content).not.toContain('success_criteria')
  })

  it('激励性没有期限被拒绝', () => {
    const { root, goal } = setup()
    expect(vaultErrorCode(() => updateGoal(root, goal.id, { kind: '激励性' }))).toBe(
      'INVALID_INPUT',
    )
  })

  it('空修改与非法状态被拒绝', () => {
    const { root, goal } = setup()
    expect(vaultErrorCode(() => updateGoal(root, goal.id, {}))).toBe('INVALID_INPUT')
    expect(vaultErrorCode(() => updateGoal(root, goal.id, { status: '搞定了' }))).toBe(
      'INVALID_INPUT',
    )
  })

  it('改名目标路径已存在时拒绝，不覆盖', () => {
    const { root, goal } = setup()
    const conflict = join(root, '10-目标', `${goal.id} 冲突标题.md`)
    writeFileSync(conflict, 'occupied', 'utf8')

    expect(vaultErrorCode(() => updateGoal(root, goal.id, { title: '冲突标题' }))).toBe('CONFLICT')
    expect(readFileSync(conflict, 'utf8')).toBe('occupied')
    expect(requireGoal(root, goal.id).title).toBe('一天学会定语从句')
  })
})
