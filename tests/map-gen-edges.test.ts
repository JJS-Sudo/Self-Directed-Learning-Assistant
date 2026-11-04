import { afterEach, describe, expect, it } from 'vitest'
import { createGoal } from '../src/domain/goals.js'
import { listNodes } from '../src/domain/nodes.js'
import { mergeGraph } from '../src/map-gen/merge.js'
import { persistCandidates } from '../src/map-gen/persist.js'
import { createEmptyVault, removeDir } from './helpers.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDir(dir)
})

describe('生成带类型的网', () => {
  it('把边映射到合并后的 temp id，并去重并列', () => {
    const merged = mergeGraph([
      {
        candidates: [
          { tempId: 'a', title: '根概念' },
          { tempId: 'b', title: '子概念' },
        ],
        edges: [
          { fromTempId: 'b', toTempId: 'a', type: 'parent' },
          { fromTempId: 'a', toTempId: 'b', type: 'sibling' },
          { fromTempId: 'b', toTempId: 'a', type: 'sibling' },
        ],
      },
    ])

    const child = merged.candidates.find((candidate) => candidate.title === '子概念')
    expect(child?.parentTempId).toBe(merged.candidates[0]?.tempId)
    expect(merged.edges.filter((edge) => edge.type === 'sibling')).toHaveLength(1)
  })

  it('第二个 parent 降级为 related 并警告', () => {
    const merged = mergeGraph([
      {
        candidates: [
          { tempId: 'a', title: 'A' },
          { tempId: 'b', title: 'B' },
          { tempId: 'c', title: 'C' },
        ],
        edges: [
          { fromTempId: 'c', toTempId: 'a', type: 'parent' },
          { fromTempId: 'c', toTempId: 'b', type: 'parent' },
        ],
      },
    ])

    expect(merged.edges.some((edge) => edge.type === 'related')).toBe(true)
    expect(merged.warnings.join('')).toContain('已有上级')
  })

  it('指向不存在候选的边被丢弃', () => {
    const merged = mergeGraph([
      {
        candidates: [{ tempId: 'a', title: 'A' }],
        edges: [{ fromTempId: 'a', toTempId: 'ghost', type: 'related' }],
      },
    ])

    expect(merged.edges).toEqual([])
    expect(merged.warnings.join('')).toContain('不存在候选')
  })

  it('落盘时写 links（parent 同步 upId）', () => {
    const root = createEmptyVault()
    dirs.push(root)
    const goal = createGoal({ root, title: '带边落盘' })

    const result = persistCandidates(
      root,
      goal.id,
      [
        { tempId: 'r', title: '根' },
        { tempId: 'c', title: '子', parentTempId: 'r' },
        { tempId: 's', title: '旁支' },
      ],
      [{ fromTempId: 's', toTempId: 'c', type: 'sibling' }],
    )

    expect(result.created).toBe(3)
    expect(result.links).toBe(1)
    const nodes = listNodes(root, goal.id)
    const child = nodes.find((node) => node.title === '子')
    const rootNode = nodes.find((node) => node.title === '根')
    const side = nodes.find((node) => node.title === '旁支')
    expect(child?.upId).toBe(rootNode?.id)
    expect(side?.links.some((link) => link.type === 'sibling')).toBe(true)
  })
})
