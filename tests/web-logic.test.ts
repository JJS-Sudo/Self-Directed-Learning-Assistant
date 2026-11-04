import { describe, expect, it } from 'vitest'
import { descendants } from '../web/src/lib/candidates.js'
import { buildLayout } from '../web/src/lib/graph-layout.js'
import type { MapCandidate } from '../src/shared/map.js'

function candidate(tempId: string, parentTempId?: string): MapCandidate {
  return {
    tempId,
    title: `节点 ${tempId}`,
    ...(parentTempId === undefined ? {} : { parentTempId }),
  }
}

describe('知识地图布局（纯逻辑）', () => {
  it('三层链：深度决定 y，父到子各一条边', () => {
    const layout = buildLayout([
      { id: 'a', title: '第一章' },
      { id: 'b', title: '1.1', upId: 'a' },
      { id: 'c', title: '1.1.1', upId: 'b' },
    ])

    expect(layout.nodes.map((node) => node.position.y)).toEqual([0, 120, 240])
    expect(layout.edges.map((edge) => `${edge.source}->${edge.target}`)).toEqual(['a->b', 'b->c'])
  })

  it('同一层的兄弟按出现顺序横向排开', () => {
    const layout = buildLayout([
      { id: 'root', title: '根' },
      { id: 'x', title: '兄弟一', upId: 'root' },
      { id: 'y', title: '兄弟二', upId: 'root' },
    ])

    const byId = new Map(layout.nodes.map((node) => [node.id, node]))
    expect(byId.get('x')?.position).toEqual({ x: 0, y: 120 })
    expect(byId.get('y')?.position).toEqual({ x: 240, y: 120 })
  })

  it('父节点成环时不死循环，坐标仍是有限数', () => {
    const layout = buildLayout([
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' },
    ])

    // 人为制造环：a 指向 b、b 指向 a
    const cyclic = buildLayout([
      { id: 'a', title: 'A', upId: 'b' },
      { id: 'b', title: 'B', upId: 'a' },
    ])

    expect(layout.nodes).toHaveLength(2)
    for (const node of cyclic.nodes) {
      expect(Number.isFinite(node.position.x)).toBe(true)
      expect(Number.isFinite(node.position.y)).toBe(true)
    }
  })

  it('父节点不存在时按顶层处理', () => {
    const layout = buildLayout([{ id: 'orphan', title: '孤儿', upId: 'missing' }])

    expect(layout.nodes[0]?.position.y).toBe(0)
    expect(layout.edges).toHaveLength(1)
  })
})

describe('候选树的后代计算', () => {
  it('返回整棵子树，不包含自己', () => {
    const candidates = [candidate('a'), candidate('b', 'a'), candidate('c', 'b'), candidate('d')]

    const children = descendants(candidates, 'a')
    expect([...children].sort()).toEqual(['b', 'c'])
    expect(children.has('a')).toBe(false)
  })

  it('叶子没有后代', () => {
    expect(descendants([candidate('a'), candidate('b', 'a')], 'b').size).toBe(0)
  })

  it('重复父引用不会重复计数', () => {
    const candidates = [candidate('a'), candidate('b', 'a'), candidate('b', 'a')]

    expect(descendants(candidates, 'a').size).toBe(1)
  })
})
