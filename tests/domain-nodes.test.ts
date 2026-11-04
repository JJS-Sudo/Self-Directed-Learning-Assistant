import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildMapTree, childrenOf, siblingsOf, topLevelOf } from '../src/domain/graph.js'
import { createGoal } from '../src/domain/goals.js'
import { addRelated, createNode, listNodes, requireNode } from '../src/domain/nodes.js'
import { linkId, parseDocument } from '../src/vault/document.js'
import { createEmptyVault, removeDir, vaultErrorCode } from './helpers.js'

const tempDirs: string[] = []

function track(dir: string): string {
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) removeDir(dir)
})

function setup(): { vault: string; goalId: string } {
  const vault = track(createEmptyVault())
  const goal = createGoal({ root: vault, title: '精通 TypeScript 类型系统' })
  return { vault, goalId: goal.id }
}

function frontmatterOf(vault: string, relativePath: string): Record<string, unknown> {
  return parseDocument(readFileSync(join(vault, relativePath), 'utf8')).data
}

function bodyOf(vault: string, relativePath: string): string {
  return readFileSync(join(vault, relativePath), 'utf8')
}

describe('TG2 · 目标与父节点的链接', () => {
  it('顶层节点：`goal` 指向目标，且不写 `up`', () => {
    const { vault, goalId } = setup()
    const node = createNode({ root: vault, title: '类型基础', goal: goalId })
    const data = frontmatterOf(vault, node.relativePath)

    expect(linkId(data['goal'])).toBe(goalId)
    expect('up' in data).toBe(false)
    expect(node.upId).toBeUndefined()
    expect(data['order']).toBe(1)
    expect(data['mastery']).toBe('未学')
    expect(data['status']).toBe('在用')
  })

  it('链接形式逐字为 `[[{id} {title}|显示名]]`，且目标与磁盘文件名一致', () => {
    const { vault, goalId } = setup()
    const node = createNode({ root: vault, title: '类型基础', goal: goalId })
    const data = frontmatterOf(vault, node.relativePath)

    expect(data['goal']).toBe(`[[${goalId} 精通 TypeScript 类型系统|精通 TypeScript 类型系统]]`)
  })

  it('子节点：`up` 指向父节点，由子指向父', () => {
    const { vault, goalId } = setup()
    const parent = createNode({ root: vault, title: '类型基础', goal: goalId })
    const child = createNode({ root: vault, title: '泛型', goal: goalId, up: parent.id })
    const data = frontmatterOf(vault, child.relativePath)

    expect(linkId(data['up'])).toBe(parent.id)
    expect(data['up']).toBe(`[[${parent.id} 类型基础|类型基础]]`)
    expect(child.upId).toBe(parent.id)
  })

  it('指向不存在的目标或父节点时拒绝写入（不产生断链）', () => {
    const { vault, goalId } = setup()

    expect(vaultErrorCode(() => createNode({ root: vault, title: 'x', goal: 'nosuch' }))).toBe(
      'NOT_FOUND',
    )
    expect(
      vaultErrorCode(() => createNode({ root: vault, title: 'x', goal: goalId, up: 'nosuch' })),
    ).toBe('NOT_FOUND')
  })

  it('父节点不属于该目标时拒绝', () => {
    const { vault, goalId } = setup()
    const otherGoal = createGoal({ root: vault, title: '另一个目标' })
    const foreign = createNode({ root: vault, title: '外来节点', goal: otherGoal.id })

    expect(
      vaultErrorCode(() => createNode({ root: vault, title: 'x', goal: goalId, up: foreign.id })),
    ).toBe('INVALID_INPUT')
  })
})

describe('TG3 · 四枝干', () => {
  it('MapNode 的 frontmatter 既没有 `parent` 也没有 `related`', () => {
    const { vault, goalId } = setup()
    const root = createNode({ root: vault, title: '类型基础', goal: goalId })
    const child = createNode({ root: vault, title: '泛型', goal: goalId, up: root.id })
    const data = frontmatterOf(vault, child.relativePath)

    expect('parent' in data).toBe(false)
    expect('related' in data).toBe(false)
  })

  it('下级由反向推导，且与"哪些节点的 up 指向本节点"完全一致', () => {
    const { vault, goalId } = setup()
    const root = createNode({ root: vault, title: '类型基础', goal: goalId })
    const first = createNode({ root: vault, title: '泛型', goal: goalId, up: root.id })
    const second = createNode({ root: vault, title: '类型体操', goal: goalId, up: root.id })
    const grandchild = createNode({ root: vault, title: '条件类型', goal: goalId, up: first.id })

    const nodes = listNodes(vault, goalId)
    const derived = childrenOf(nodes, root.id).map((node) => node.id)
    const byFact = nodes.filter((node) => node.upId === root.id).map((node) => node.id)

    expect(derived).toEqual([first.id, second.id])
    // "完全一致"指集合一致；顺序由 TG4 的 order 单独保证
    expect([...derived].sort()).toEqual([...byFact].sort())
    expect(childrenOf(nodes, first.id).map((node) => node.id)).toEqual([grandchild.id])
  })

  it('并列 = 同一 `up` 下的兄弟集合，按 order 升序', () => {
    const { vault, goalId } = setup()
    const root = createNode({ root: vault, title: '类型基础', goal: goalId })
    const first = createNode({ root: vault, title: '泛型', goal: goalId, up: root.id })
    const second = createNode({ root: vault, title: '类型体操', goal: goalId, up: root.id })

    const nodes = listNodes(vault, goalId)
    expect(siblingsOf(nodes, first.id).map((node) => node.id)).toEqual([first.id, second.id])
    expect(topLevelOf(nodes).map((node) => node.id)).toEqual([root.id])
  })

  it('相关关系只写进源节点的正文受管区块，目标节点不反向写入', () => {
    const { vault, goalId } = setup()
    const first = createNode({ root: vault, title: '条件类型', goal: goalId })
    const second = createNode({ root: vault, title: '类型体操', goal: goalId })

    const result = addRelated(vault, first.id, second.id)

    expect(result.alreadyPresent).toBe(false)
    const sourceRaw = bodyOf(vault, first.relativePath)
    expect(sourceRaw).toContain(`[[${second.id} 类型体操|类型体操]]`)
    expect(sourceRaw).toContain('<!-- sdl:begin -->')
    // 目标节点正文里没有反向链接（Obsidian 的双链本身就是双向的）
    expect(bodyOf(vault, second.relativePath)).not.toContain(`[[${first.id} 条件类型|条件类型]]`)
    // 相关关系不在 frontmatter 里
    expect('related' in frontmatterOf(vault, first.relativePath)).toBe(false)
  })

  it('相关关系幂等：重复建立不会写第二遍', () => {
    const { vault, goalId } = setup()
    const first = createNode({ root: vault, title: '条件类型', goal: goalId })
    const second = createNode({ root: vault, title: '类型体操', goal: goalId })

    addRelated(vault, first.id, second.id)
    const again = addRelated(vault, first.id, second.id)

    expect(again.alreadyPresent).toBe(true)
    const link = `[[${second.id} 类型体操|类型体操]]`
    const occurrences = bodyOf(vault, first.relativePath).split(link).length - 1
    expect(occurrences).toBe(1)
    expect(requireNode(vault, first.id).relatedIds).toEqual([second.id])
  })

  it('不能把节点关联到它自己', () => {
    const { vault, goalId } = setup()
    const node = createNode({ root: vault, title: '自恋节点', goal: goalId })

    expect(vaultErrorCode(() => addRelated(vault, node.id, node.id))).toBe('INVALID_INPUT')
  })

  it('buildMapTree 按 up 推出树，并在节点上挂出相关节点', () => {
    const { vault, goalId } = setup()
    const root = createNode({ root: vault, title: '类型基础', goal: goalId })
    const child = createNode({ root: vault, title: '泛型', goal: goalId, up: root.id })
    const grandchild = createNode({ root: vault, title: '条件类型', goal: goalId, up: child.id })
    const sibling = createNode({ root: vault, title: '类型体操', goal: goalId, up: root.id })
    addRelated(vault, grandchild.id, sibling.id)

    const tree = buildMapTree(listNodes(vault, goalId))

    expect(tree.map((node) => node.id)).toEqual([root.id])
    expect(tree[0]?.children.map((node) => node.id)).toEqual([child.id, sibling.id])
    expect(tree[0]?.children[0]?.children.map((node) => node.id)).toEqual([grandchild.id])
    expect(tree[0]?.children[0]?.children[0]?.related).toEqual([
      { id: sibling.id, title: '类型体操' },
    ])
  })
})

describe('TG4 · 同级顺序', () => {
  it('同一父节点下连续创建的兄弟节点 order 为 1/2/3', () => {
    const { vault, goalId } = setup()
    const root = createNode({ root: vault, title: '类型基础', goal: goalId })
    const first = createNode({ root: vault, title: '甲', goal: goalId, up: root.id })
    const second = createNode({ root: vault, title: '乙', goal: goalId, up: root.id })
    const third = createNode({ root: vault, title: '丙', goal: goalId, up: root.id })

    expect([first.order, second.order, third.order]).toEqual([1, 2, 3])
    expect(childrenOf(listNodes(vault, goalId), root.id).map((node) => node.order)).toEqual([
      1, 2, 3,
    ])
  })

  it('两次拉取返回顺序完全相同', () => {
    const { vault, goalId } = setup()
    const root = createNode({ root: vault, title: '类型基础', goal: goalId })
    createNode({ root: vault, title: '甲', goal: goalId, up: root.id })
    createNode({ root: vault, title: '乙', goal: goalId, up: root.id })

    const once = childrenOf(listNodes(vault, goalId), root.id).map((node) => node.id)
    const twice = childrenOf(listNodes(vault, goalId), root.id).map((node) => node.id)

    expect(twice).toEqual(once)
  })

  it('不同父节点下的 order 互不干扰', () => {
    const { vault, goalId } = setup()
    const root = createNode({ root: vault, title: '类型基础', goal: goalId })
    const other = createNode({ root: vault, title: '另一棵树的根', goal: goalId })
    createNode({ root: vault, title: '甲', goal: goalId, up: root.id })
    const underOther = createNode({ root: vault, title: '丙', goal: goalId, up: other.id })

    expect(underOther.order).toBe(1)
  })

  it('顶层节点之间也按 order 排序', () => {
    const { vault, goalId } = setup()
    const first = createNode({ root: vault, title: '顶层甲', goal: goalId })
    const second = createNode({ root: vault, title: '顶层乙', goal: goalId })

    expect([first.order, second.order]).toEqual([1, 2])
    expect(topLevelOf(listNodes(vault, goalId)).map((node) => node.id)).toEqual([
      first.id,
      second.id,
    ])
  })
})
