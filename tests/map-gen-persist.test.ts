import { afterEach, describe, expect, it } from 'vitest'
import { createGoal } from '../src/domain/goals.js'
import { listNodes } from '../src/domain/nodes.js'
import { persistCandidates } from '../src/map-gen/persist.js'
import { createEmptyVault, removeDir } from './helpers.js'

const dirs: string[] = []

function setup(): { root: string; goalId: string } {
  const root = createEmptyVault()
  dirs.push(root)
  const goal = createGoal({ root, title: '测试目标' })
  return { root, goalId: goal.id }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDir(dir)
})

describe('候选落盘', () => {
  it('先建父后建子，父链接与同级 order 正确', () => {
    const { root, goalId } = setup()

    const result = persistCandidates(root, goalId, [
      { tempId: '1-a', title: '第一章' },
      { tempId: '1-b', title: '1.1 小节', parentTempId: '1-a' },
      { tempId: '1-c', title: '1.2 小节', parentTempId: '1-a' },
    ])

    expect(result.created).toBe(3)
    const nodes = listNodes(root, goalId)
    const parent = nodes.find((node) => node.title === '第一章')
    const children = nodes.filter((node) => node.upId === parent?.id)

    expect(children.map((node) => node.title).sort()).toEqual(['1.1 小节', '1.2 小节'])
    expect(children.map((node) => node.order).sort()).toEqual([1, 2])
  })

  it('与既有节点重名时加「（2）」后缀', () => {
    const { root, goalId } = setup()
    persistCandidates(root, goalId, [{ tempId: 'a', title: '线性回归' }])

    persistCandidates(root, goalId, [
      { tempId: 'b', title: '线性回归' },
      { tempId: 'c', title: '线性回归', parentTempId: 'b' },
    ])

    const titles = listNodes(root, goalId).map((node) => node.title)
    expect(titles).toContain('线性回归')
    expect(titles).toContain('线性回归（2）')
    expect(titles).toContain('线性回归（3）')
  })

  it('落盘后返回四类覆盖警告（空路径时叶子全部未覆盖）', () => {
    const { root, goalId } = setup()

    const result = persistCandidates(root, goalId, [
      { tempId: 'a', title: '第一章' },
      { tempId: 'b', title: '1.1 小节', parentTempId: 'a' },
    ])

    expect(result.warnings.some((warning) => warning.includes('没有被任何路径段覆盖'))).toBe(true)
  })

  it('目标不存在时抛 NOT_FOUND', () => {
    const { root } = setup()

    expect(() => persistCandidates(root, 'nope01', [{ tempId: 'a', title: 'x' }])).toThrowError(
      /目标不存在/,
    )
  })
})
