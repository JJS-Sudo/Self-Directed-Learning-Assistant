import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createGoal } from '../src/domain/goals.js'
import {
  addLink,
  createNode,
  listNodes,
  removeLink,
  requireNode,
  updateNode,
} from '../src/domain/nodes.js'
import { referencesOf, removeNode } from '../src/domain/node-remove.js'
import { createStage } from '../src/domain/path-stages.js'
import { createEmptyVault, removeDir } from './helpers.js'

const dirs: string[] = []

function setup() {
  const root = createEmptyVault()
  dirs.push(root)
  const goal = createGoal({ root, title: '关系测试' })
  const a = createNode({ root, title: '概念 A', goal: goal.id })
  const b = createNode({ root, title: '概念 B', goal: goal.id })
  const c = createNode({ root, title: '概念 C', goal: goal.id })
  return { root, goalId: goal.id, a, b, c }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDir(dir)
})

describe('带类型的关系', () => {
  it('parent 同步 upId，且只能有一个', () => {
    const { root, a, b, c } = setup()

    expect(addLink(root, b.id, a.id, 'parent').upId).toBe(a.id)
    expect(requireNode(root, b.id).links).toEqual([{ to: a.id, type: 'parent' }])
    expect(() => addLink(root, b.id, c.id, 'parent')).toThrowError(/已经有上级/)
  })

  it('环检测', () => {
    const { root, a, b } = setup()
    addLink(root, b.id, a.id, 'parent')

    expect(() => addLink(root, a.id, b.id, 'parent')).toThrowError(/形成环/)
  })

  it('并列/相关双向只存一条', () => {
    const { root, a, b } = setup()
    addLink(root, a.id, b.id, 'sibling')
    addLink(root, b.id, a.id, 'sibling')

    const count = listNodes(root, a.goalId as string).reduce(
      (sum, node) => sum + node.links.filter((link) => link.type === 'sibling').length,
      0,
    )
    expect(count).toBe(1)
  })

  it('删除关系时把反向存的那条也清掉', () => {
    const { root, a, b } = setup()
    addLink(root, a.id, b.id, 'related')
    removeLink(root, b.id, a.id, 'related')

    expect(requireNode(root, a.id).links).toEqual([])
  })

  it('旧文件没有 links 时由 upId 合成 parent', () => {
    const { root, a } = setup()
    const child = createNode({ root, title: '子节点', goal: a.goalId as string, up: a.id })
    const file = readFileSync(join(root, child.relativePath), 'utf8')
    expect(file).toContain('up:')

    expect(requireNode(root, child.id).links).toEqual([{ to: a.id, type: 'parent' }])
  })
})

describe('节点编辑', () => {
  it('改标题会同步改文件名', () => {
    const { root, a } = setup()

    const updated = updateNode({ root, id: a.id, title: '改名后的概念' })

    expect(updated.title).toBe('改名后的概念')
    expect(updated.relativePath).toContain('改名后的概念')
    expect(() => readFileSync(join(root, a.relativePath), 'utf8')).toThrow()
  })

  it('删除节点会清掉指向它的关系', () => {
    const { root, a, b } = setup()
    addLink(root, b.id, a.id, 'parent')
    addLink(root, b.id, a.id, 'related')

    removeNode(root, a.id)

    const rest = requireNode(root, b.id)
    expect(rest.upId).toBeUndefined()
    expect(rest.links).toEqual([])
  })

  it('删除被路径段引用的节点：references 非空', () => {
    const { root, goalId, a } = setup()
    createStage({
      root,
      goal: goalId,
      title: '第一段',
      estimate: '约 1 天',
      nodes: [a.id],
      checks: ['能讲清概念 A'],
      order: 1,
    })

    const references = referencesOf(root, a.id)
    expect(references.stages).toHaveLength(1)
    expect(references.stages[0]?.title).toBe('第一段')
  })
})
