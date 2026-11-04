import { readdirSync, utimesSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { listGoals } from '../src/domain/goals.js'
import { indexFilePath } from '../src/index-db/db.js'
import {
  describeSource,
  formatStamp,
  readGoals,
  readMeta,
  readStoredStamp,
} from '../src/index-db/goals-index.js'
import { forceRebuild, removeIndexFile, withGoalsIndex } from '../src/index-db/with-index.js'
import { createEmptyVault, createTempVault, removeDir } from './helpers.js'

const dirs: string[] = []

function vault(): string {
  const dir = createTempVault()
  dirs.push(dir)
  return dir
}

function goalFiles(root: string): string[] {
  return readdirSync(join(root, '10-目标')).filter((name) => name.endsWith('.md'))
}

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDir(dir)
})

describe('goals 索引', () => {
  it('重建后的行数与 listGoals 一致，且能从索引读回字段', () => {
    const root = vault()
    const count = forceRebuild(root)

    expect(count).toBe(listGoals(root).length)

    const rows = withGoalsIndex(root, (db) => readGoals(db)).value
    expect(rows.map((row) => row.id).sort()).toEqual(
      listGoals(root)
        .map((goal) => goal.id)
        .sort(),
    )

    const sample = rows[0]
    expect(sample?.title).toBeTruthy()
    expect(sample?.kind).toBeTruthy()
    expect(sample?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('空库也能建索引（0 行）', () => {
    const root = createEmptyVault()
    dirs.push(root)

    expect(forceRebuild(root)).toBe(0)
    expect(withGoalsIndex(root, (db) => readGoals(db)).value).toEqual([])
  })

  it('删掉索引文件后，下一次调用自动重建（不需要重启进程）', () => {
    const root = vault()
    withGoalsIndex(root, () => undefined)
    expect(existsSync(indexFilePath(root))).toBe(true)

    removeIndexFile(root)

    const result = withGoalsIndex(root, (db) => readGoals(db))
    expect(result.rebuilt).toBe(true)
    expect(result.value).toHaveLength(listGoals(root).length)
    expect(existsSync(indexFilePath(root))).toBe(true)
  })

  it('同一快照下不重复重建（built_at 不变）', () => {
    const root = vault()
    const first = withGoalsIndex(root, (db) => readMeta(db, 'built_at')).value
    const second = withGoalsIndex(root, (db) => readMeta(db, 'built_at')).value

    expect(second).toBe(first)
  })

  it('源文件 mtime 变化会触发重建', () => {
    const root = vault()
    const before = withGoalsIndex(root, (db) => readStoredStamp(db)).value

    const [fileName] = goalFiles(root)
    const later = new Date(Date.now() + 5_000)
    utimesSync(join(root, '10-目标', fileName ?? ''), later, later)

    expect(formatStamp(describeSource(root))).not.toBe(before)
    expect(withGoalsIndex(root, (db) => readStoredStamp(db)).rebuilt).toBe(true)
  })

  it('forceRebuild 幂等：连跑两次行数相同', () => {
    const root = vault()
    expect(forceRebuild(root)).toBe(forceRebuild(root))
  })
})
