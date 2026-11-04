import { closeSync, openSync, readSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { migrate } from './migrations.js'

export const INDEX_FILE = '.sdl-index.db'

export function indexFilePath(root: string): string {
  return join(root, INDEX_FILE)
}

/**
 * 打开（或创建）库根下的索引。索引是**派生物**：删掉它不会丢任何数据，
 * 下一次 `withGoalsIndex` 会从 Markdown 重建。
 *
 * 迁移失败时**先关连接再抛错** —— Windows 上留着句柄会让后续「删/改名坏文件」失败。
 */
export function openIndex(root: string): Database.Database {
  const db = new Database(indexFilePath(root))

  try {
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = NORMAL')
    db.pragma('busy_timeout = 3000')
    migrate(db)
    return db
  } catch (error) {
    db.close()
    throw error
  }
}

/**
 * 只读前 16 字节判断是不是 SQLite 库。
 * **不打开 SQLite 连接**：对垃圾文件先 `new Database()` 可能在 Windows 上留下句柄，
 * 导致后面删/改名失败（EPERM）。
 */
export function looksLikeSqlite(path: string): boolean {
  let fd: number | undefined
  try {
    fd = openSync(path, 'r')
    const header = Buffer.alloc(16)
    const read = readSync(fd, header, 0, 16, 0)
    return read === 16 && header.toString('utf8', 0, 15) === 'SQLite format 3'
  } catch {
    return false
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}
