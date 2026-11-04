import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createGoal } from '../src/domain/goals.js'
import { createNode } from '../src/domain/nodes.js'
import { writeProfile } from '../src/domain/profile.js'
import {
  RESOURCES_DIR,
  createResource,
  listResources,
  listResourcesRanked,
  requireResource,
} from '../src/domain/resources.js'
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

function setup(): { vault: string; goalId: string; nodeId: string } {
  const vault = track(createEmptyVault())
  const goal = createGoal({ root: vault, title: '精通 TypeScript 类型系统' })
  const node = createNode({ root: vault, title: '泛型', goal: goal.id })
  return { vault, goalId: goal.id, nodeId: node.id }
}

function frontmatterOf(vault: string, relativePath: string): Record<string, unknown> {
  return parseDocument(readFileSync(join(vault, relativePath), 'utf8')).data
}

describe('TG3 · 资源的两类媒介与知识网关联', () => {
  it('视频与文字两类都能落到 40-资源/，且 node 链接逐字正确', () => {
    const { vault, nodeId } = setup()
    const text = createResource({
      root: vault,
      title: 'TypeScript 官方手册 · 泛型',
      node: nodeId,
      media: '文字',
      level: '入门',
      url: 'https://www.typescriptlang.org/docs/handbook/2/generics.html',
      tags: ['泛型', '手册'],
      durationMin: 45,
    })
    const video = createResource({
      root: vault,
      title: '泛型入门讲解（视频）',
      node: nodeId,
      media: '视频',
      level: '入门',
      durationMin: 20,
    })

    expect(text.relativePath.startsWith(RESOURCES_DIR)).toBe(true)

    const data = frontmatterOf(vault, text.relativePath)
    expect(data['media']).toBe('文字')
    expect(data['level']).toBe('入门')
    expect(data['duration_min']).toBe(45)
    expect(data['tags']).toEqual(['泛型', '手册'])
    expect(linkId(data['node'])).toBe(nodeId)
    expect(linkId(data['node'])).toBe(video.nodeId)
  })

  it('tags 接受逗号分隔的字符串，去空去重保序', () => {
    const { vault, nodeId } = setup()
    const resource = createResource({
      root: vault,
      title: '带标签的资源',
      node: nodeId,
      media: '文字',
      level: '进阶',
      tags: '泛型, 手册，泛型、  ',
    })

    expect(resource.tags).toEqual(['泛型', '手册'])
    expect(listResources(vault).find((item) => item.id === resource.id)?.tags).toEqual([
      '泛型',
      '手册',
    ])
  })

  it('duration_min 是可选字段：不给就没有这个键', () => {
    const { vault, nodeId } = setup()
    const resource = createResource({
      root: vault,
      title: '没有时长的资源',
      node: nodeId,
      media: '视频',
      level: '入门',
    })

    expect(resource.durationMin).toBeUndefined()
    expect('duration_min' in frontmatterOf(vault, resource.relativePath)).toBe(false)
  })

  it('创建时就写出非空的 rank_reason（含因子名）', () => {
    const { vault, nodeId } = setup()
    writeProfile(vault, { level: '入门', mediaPreference: '文字', timeBudget: 2 })

    const resource = createResource({
      root: vault,
      title: '官方手册',
      node: nodeId,
      media: '文字',
      level: '入门',
      durationMin: 30,
    })

    expect(resource.rankReason).not.toBe('')
    expect(resource.rankReason).toContain('水平匹配')
    expect(resource.rankReason).toContain('媒介偏好')
    expect(resource.rankReason).toContain('时长')
    expect(frontmatterOf(vault, resource.relativePath)['rank_reason']).toBe(resource.rankReason)
  })

  it('node 不存在报 NOT_FOUND；media / level 取值域外被拒绝', () => {
    const { vault, nodeId } = setup()

    expect(
      vaultErrorCode(() =>
        createResource({ root: vault, title: 'x', node: 'nope', media: '文字', level: '入门' }),
      ),
    ).toBe('NOT_FOUND')

    expect(
      vaultErrorCode(() =>
        createResource({ root: vault, title: 'x', node: nodeId, media: '播客', level: '入门' }),
      ),
    ).toBe('INVALID_INPUT')

    expect(
      vaultErrorCode(() =>
        createResource({ root: vault, title: 'x', node: nodeId, media: '文字', level: '大师' }),
      ),
    ).toBe('INVALID_INPUT')
  })

  it('按节点过滤，并且 requireResource 对不存在的 id 报 NOT_FOUND', () => {
    const { vault, goalId, nodeId } = setup()
    const otherNode = createNode({ root: vault, title: '条件类型', goal: goalId })

    createResource({ root: vault, title: 'A', node: nodeId, media: '文字', level: '入门' })
    createResource({ root: vault, title: 'B', node: otherNode.id, media: '视频', level: '入门' })

    expect(listResources(vault)).toHaveLength(2)
    expect(listResources(vault, { nodeIds: [nodeId] })).toHaveLength(1)
    expect(listResources(vault, { nodeIds: [otherNode.id] })[0]?.title).toBe('B')
    expect(listResourcesRanked(vault, { nodeIds: ['nope'] })).toEqual([])
    expect(vaultErrorCode(() => requireResource(vault, 'nope'))).toBe('NOT_FOUND')
  })
})
