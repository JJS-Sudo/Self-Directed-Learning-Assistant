import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createGoal } from '../src/domain/goals.js'
import { createNode } from '../src/domain/nodes.js'
import {
  attachNodeToResource,
  createResource,
  detachNodeFromResource,
  listResources,
  requireResource,
} from '../src/domain/resources.js'
import { parseDocument } from '../src/vault/document.js'
import { createEmptyVault, removeDir } from './helpers.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDir(dir)
})

function setup() {
  const root = createEmptyVault()
  dirs.push(root)
  const goal = createGoal({ root, title: '资源多节点测试' })
  const a = createNode({ root, title: '先验', goal: goal.id })
  const b = createNode({ root, title: '后验', goal: goal.id })
  return { root, goalId: goal.id, a, b }
}

describe('资源多节点与未验证', () => {
  it('创建时同时写 node 与 nodes；旧字段仍指向第一个节点', () => {
    const { root, a } = setup()
    const resource = createResource({
      root,
      title: '贝叶斯入门',
      node: a.id,
      media: '文字',
      level: '入门',
      url: 'https://example.test/bayes',
    })

    const data = parseDocument(readFileSync(join(root, resource.relativePath), 'utf8')).data
    expect(resource.nodeIds).toEqual([a.id])
    expect(data['node']).toBeDefined()
    expect(Array.isArray(data['nodes'])).toBe(true)
  })

  it('同一 URL 追加到第二个节点，只保留一个文件', () => {
    const { root, a, b } = setup()
    const resource = createResource({
      root,
      title: '共享资源',
      node: a.id,
      media: '视频',
      level: '入门',
      url: 'https://example.test/shared',
    })

    expect(attachNodeToResource(root, resource.id, b.id)).toBe(true)
    expect(attachNodeToResource(root, resource.id, b.id)).toBe(false)

    expect(listResources(root)).toHaveLength(1)
    expect(requireResource(root, resource.id).nodeIds).toEqual([a.id, b.id])
    expect(listResources(root, { nodeIds: [b.id] })).toHaveLength(1)
  })

  it('从未验证资源上移除节点；最后一个节点移除后删除文件', () => {
    const { root, a, b } = setup()
    const resource = createResource({
      root,
      title: '在 B 站搜索「先验」',
      node: a.id,
      media: '视频',
      level: '入门',
      url: 'https://search.bilibili.com/all?keyword=先验',
      unverified: true,
    })
    expect(resource.unverified).toBe(true)

    attachNodeToResource(root, resource.id, b.id)
    expect(detachNodeFromResource(root, resource.id, b.id)).toBe('detached')
    expect(listResources(root)).toHaveLength(1)

    expect(detachNodeFromResource(root, resource.id, a.id)).toBe('deleted')
    expect(listResources(root)).toHaveLength(0)
  })
})
