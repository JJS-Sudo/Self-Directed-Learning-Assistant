import { existsSync, renameSync, rmSync } from 'node:fs'
import type { Database } from 'better-sqlite3'
import { indexFilePath, looksLikeSqlite, openIndex } from './db.js'
import { describeSource, formatStamp, readStoredStamp, rebuildGoals } from './goals-index.js'

export interface IndexResult<T> {
  value: T
  /** 这次调用是否触发了重建 */
  rebuilt: boolean
}

/**
 * 打开索引、按需重建、执行回调、**关闭连接**。
 *
 * 每次请求开关连接是有意为之：Windows 上常开的 SQLite 句柄会锁住文件，
 * 用户「删掉 .sdl-index.db 看能不能自愈」时删不动 —— 而那正是本阶段的验收场景。
 */
export function withGoalsIndex<T>(root: string, fn: (db: Database) => T): IndexResult<T> {
  const db = openSafely(root)

  try {
    const stamp = formatStamp(describeSource(root))
    const rebuilt = readStoredStamp(db) !== stamp
    if (rebuilt) rebuildGoals(db, root)
    return { value: fn(db), rebuilt }
  } finally {
    db.close()
  }
}

/** 强制全量重建（`npm run index` 用），返回行数 */
export function forceRebuild(root: string): number {
  const db = openSafely(root)
  try {
    return rebuildGoals(db, root)
  } finally {
    db.close()
  }
}

/** 索引文件坏了（不是 SQLite 库 / schema 太新）时删掉重建，而不是让整个应用挂掉 */
function openSafely(root: string): Database {
  const path = indexFilePath(root)
  if (existsSync(path) && !looksLikeSqlite(path)) {
    quarantine(path)
  }

  try {
    return openIndex(root)
  } catch (error) {
    if (!existsSync(path)) throw error
    quarantine(path)
    for (const suffix of ['-wal', '-shm']) {
      try {
        rmSync(`${path}${suffix}`, { force: true })
      } catch {
        // 旧文件的锁不影响新建
      }
    }
    return openIndex(root)
  }
}

/** 删不掉就改名隔离：Windows 上文件被占用时 `rm` 会 EPERM，但 `rename` 通常仍可用 */
function quarantine(path: string): void {
  try {
    renameSync(path, `${path}.corrupt-${Date.now()}`)
  } catch {
    rmSync(path, { force: true })
  }
}

/** 测试用：索引不存在时什么都不做；存在就删干净 */
export function removeIndexFile(root: string): void {
  const path = indexFilePath(root)
  rmSync(path, { force: true })
  rmSync(`${path}-wal`, { force: true })
  rmSync(`${path}-shm`, { force: true })
}
