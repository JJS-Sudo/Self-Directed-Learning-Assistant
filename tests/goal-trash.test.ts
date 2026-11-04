import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createGoal } from '../src/domain/goals.js'
import { listTrash, purgeTrash, restoreTrash, trashGoal } from '../src/domain/goal-trash.js'
import { createNode } from '../src/domain/nodes.js'
import { createStage } from '../src/domain/path-stages.js'
import { attachNodeToResource, createResource, listResources } from '../src/domain/resources.js'
import { TRASH_DIR } from '../src/vault/paths.js'
import { createEmptyVault, removeDir, vaultErrorCode } from './helpers.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDir(dir)
})

function setup() {
  const root = createEmptyVault()
  dirs.push(root)

  const goalA = createGoal({ root, title: '目标 A' })
  const a1 = createNode({ root, title: '节点 A1', goal: goalA.id })
  const a2 = createNode({ root, title: '节点 A2', goal: goalA.id })
  createStage({
    root,
    goal: goalA.id,
    title: '第一阶段',
    estimate: '约 1 天',
    nodes: [a1.id, a2.id],
    checks: ['能独立复述该知识点并给出一个例子'],
  })

  const goalB = createGoal({ root, title: '目标 B' })
  const b1 = createNode({ root, title: '节点 B1', goal: goalB.id })

  const exclusive = createResource({
    root,
    title: '独占资源',
    node: a1.id,
    media: '文字',
    level: '入门',
    url: 'https://exclusive.test/1',
  })
  const shared = createResource({
    root,
    title: '共享资源',
    node: a1.id,
    media: '文字',
    level: '入门',
    url: 'https://shared.test/1',
  })
  attachNodeToResource(root, shared.id, b1.id)

  return { root, goalA, goalB, a1, b1, exclusive, shared }
}

describe('目标回收站', () => {
  it('软删除：目标/分区/独占资源进回收站，共享资源只解除关联', () => {
    const { root, goalA, exclusive, shared } = setup()
    const { trashId, manifest } = trashGoal(root, goalA.id)

    expect(manifest.goalId).toBe(goalA.id)
    expect(manifest.exclusiveResources).toHaveLength(1)
    expect(manifest.sharedResources).toHaveLength(1)

    expect(existsSync(join(root, goalA.relativePath))).toBe(false)
    expect(existsSync(join(root, TRASH_DIR, trashId, 'goal.md'))).toBe(true)
    expect(existsSync(join(root, TRASH_DIR, trashId, 'manifest.json'))).toBe(true)
    expect(existsSync(join(root, TRASH_DIR, trashId, 'partition'))).toBe(true)

    expect(existsSync(join(root, exclusive.relativePath))).toBe(false)
    const sharedNow = listResources(root).find((resource) => resource.id === shared.id)
    expect(sharedNow).toBeDefined()
    expect(sharedNow?.nodeIds).toHaveLength(1)
  })

  it('列出回收站条目', () => {
    const { root, goalA } = setup()
    const { trashId } = trashGoal(root, goalA.id)
    const entries = listTrash(root)
    expect(entries.map((entry) => entry.trashId)).toEqual([trashId])
    expect(entries[0]?.title).toBe('目标 A')
  })

  it('恢复：目标、分区、独占资源与共享关联全部回来', () => {
    const { root, goalA, a1, exclusive, shared } = setup()
    const { trashId } = trashGoal(root, goalA.id)

    const result = restoreTrash(root, trashId)
    expect(result.goalId).toBe(goalA.id)
    expect(existsSync(join(root, goalA.relativePath))).toBe(true)
    expect(existsSync(join(root, TRASH_DIR, trashId))).toBe(false)
    expect(existsSync(join(root, exclusive.relativePath))).toBe(true)

    const sharedNow = listResources(root).find((resource) => resource.id === shared.id)
    expect(sharedNow?.nodeIds).toContain(a1.id)
    expect(sharedNow?.nodeIds).toHaveLength(2)
  })

  it('恢复时目标路径已存在返回 CONFLICT，且不丢回收站文件', () => {
    const { root, goalA } = setup()
    const { trashId } = trashGoal(root, goalA.id)
    writeFileSync(join(root, goalA.relativePath), 'occupied', 'utf8')

    expect(vaultErrorCode(() => restoreTrash(root, trashId))).toBe('CONFLICT')
    expect(readFileSync(join(root, TRASH_DIR, trashId, 'goal.md'), 'utf8')).not.toBe('')
  })

  it('彻底删除后条目与独占资源都消失，共享资源保留', () => {
    const { root, goalA, exclusive, shared } = setup()
    const { trashId } = trashGoal(root, goalA.id)

    purgeTrash(root, trashId)
    expect(existsSync(join(root, TRASH_DIR, trashId))).toBe(false)
    expect(existsSync(join(root, exclusive.relativePath))).toBe(false)
    expect(listResources(root).some((resource) => resource.id === shared.id)).toBe(true)
  })
})
