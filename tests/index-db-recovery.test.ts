import { writeFileSync } from 'node:fs'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { createGoal, listGoals } from '../src/domain/goals.js'
import { indexFilePath } from '../src/index-db/db.js'
import { readGoals } from '../src/index-db/goals-index.js'
import { forceRebuild, withGoalsIndex } from '../src/index-db/with-index.js'
import { createEmptyVault, removeDir } from './helpers.js'

const dirs: string[] = []

function setup(): string {
  const root = createEmptyVault()
  dirs.push(root)
  createGoal({ root, title: '索引恢复测试' })
  return root
}

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDir(dir)
})

describe('索引损坏后的自愈', () => {
  it('索引文件是垃圾内容时删掉重建，而不是让应用挂掉', () => {
    const root = setup()
    writeFileSync(indexFilePath(root), 'this is not sqlite', 'utf8')

    const result = withGoalsIndex(root, (db) => readGoals(db))

    expect(result.rebuilt).toBe(true)
    expect(result.value).toHaveLength(listGoals(root).length)
  })

  it('索引版本比程序新时也重建（索引是可丢弃的缓存）', () => {
    const root = setup()
    forceRebuild(root)

    const raw = new Database(indexFilePath(root))
    raw.pragma('user_version = 99')
    raw.close()

    const result = withGoalsIndex(root, (db) => readGoals(db))

    expect(result.rebuilt).toBe(true)
    expect(result.value).toHaveLength(listGoals(root).length)
  })

  it('forceRebuild 幂等：版本停在 1，行数不变', () => {
    const root = setup()
    const first = forceRebuild(root)
    const second = forceRebuild(root)

    const raw = new Database(indexFilePath(root), { readonly: true })
    const version = raw.pragma('user_version', { simple: true })
    raw.close()

    expect(second).toBe(first)
    expect(version).toBe(1)
  })
})
