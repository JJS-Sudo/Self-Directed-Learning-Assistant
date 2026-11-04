import { describe, expect, it } from 'vitest'
import { computeForceLayout } from '../web/src/lib/force-layout.js'
import type { MapNodeDto } from '../src/shared/map.js'

function node(id: string, title: string, links: MapNodeDto['links'] = []): MapNodeDto {
  return { id, title, order: 1, mastery: '未学', links }
}

describe('力导向布局', () => {
  it('固定中心在原点，坐标都是有限数', () => {
    const positions = computeForceLayout(
      [node('a', 'A'), node('b', 'B', [{ to: 'a', type: 'parent' }])],
      { goalId: 'goal' },
    )

    const goal = positions.find((item) => item.id === 'goal')
    expect(goal).toMatchObject({ x: 0, y: 0 })
    for (const item of positions) {
      expect(Number.isFinite(item.x)).toBe(true)
      expect(Number.isFinite(item.y)).toBe(true)
    }
  })

  it('同样的输入两次结果一致（确定性）', () => {
    const nodes = [node('a', 'A'), node('b', 'B'), node('c', 'C', [{ to: 'a', type: 'sibling' }])]
    const first = computeForceLayout(nodes, { goalId: 'goal' })
    const second = computeForceLayout(nodes, { goalId: 'goal' })

    expect(second).toEqual(first)
  })

  it('孤立节点也有位置', () => {
    const positions = computeForceLayout([node('solo', '孤立')], { goalId: 'goal' })
    expect(positions.find((item) => item.id === 'solo')).toBeDefined()
  })
})
