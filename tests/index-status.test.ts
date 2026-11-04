import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createGoal } from '../src/domain/goals.js'
import { readIndexStatus } from '../src/index-db/status.js'
import { forceRebuild } from '../src/index-db/with-index.js'
import { createEmptyVault, removeDir } from './helpers.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDir(dir)
})

describe('索引状态', () => {
  it('没有索引文件时报 absent', () => {
    const root = createEmptyVault()
    dirs.push(root)
    createGoal({ root, title: '状态测试' })

    const status = readIndexStatus(root)
    expect(status.status).toBe('absent')
    expect(status.note).toContain('还没有索引')
  })

  it('重建后报 ok，并带上目标数量', () => {
    const root = createEmptyVault()
    dirs.push(root)
    createGoal({ root, title: '状态测试' })

    forceRebuild(root)
    const status = readIndexStatus(root)
    expect(status.status).toBe('ok')
    expect(status.goals).toBe(1)
    expect(status.note).toContain('已索引 1 个目标')
  })

  it('源文件改动后报 stale', () => {
    const root = createEmptyVault()
    dirs.push(root)
    const goal = createGoal({ root, title: '状态测试' })
    forceRebuild(root)

    writeFileSync(join(root, goal.relativePath), '\n\n（补一段笔记）\n', { flag: 'a' })

    expect(readIndexStatus(root).status).toBe('stale')
  })
})
