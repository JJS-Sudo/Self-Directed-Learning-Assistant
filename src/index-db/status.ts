import { existsSync } from 'node:fs'
import Database from 'better-sqlite3'
import { indexFilePath, looksLikeSqlite } from './db.js'
import { describeSource, formatStamp, readStoredStamp } from './goals-index.js'

export interface IndexStatus {
  status: 'absent' | 'ok' | 'stale'
  note: string
  goals: number
}

/**
 * 只读地报告索引状态，不创建、不迁移、不重建。
 * 索引是派生物：不存在或损坏都只提示「下次读取会重建」，不报错。
 */
export function readIndexStatus(root: string): IndexStatus {
  const path = indexFilePath(root)

  if (!existsSync(path)) {
    return {
      status: 'absent',
      note: '还没有索引；读取目标列表或运行 npm run index 会自动建立',
      goals: 0,
    }
  }

  if (!looksLikeSqlite(path)) {
    return {
      status: 'absent',
      note: '索引文件损坏；删掉它会在下次读取时自动重建',
      goals: 0,
    }
  }

  let db: Database.Database | undefined
  try {
    db = new Database(path, { readonly: true, fileMustExist: true })
    const row = db.prepare('select count(*) as count from goals').get() as
      { count: number } | undefined
    const goals = row?.count ?? 0
    const stored = readStoredStamp(db)
    const current = formatStamp(describeSource(root))

    if (stored === current) {
      return { status: 'ok', note: `已索引 ${goals} 个目标`, goals }
    }
    return {
      status: 'stale',
      note: '源文件有变化；下次读取目标列表时会自动重建',
      goals,
    }
  } catch {
    return {
      status: 'stale',
      note: '索引暂时无法读取；下次读取目标列表时会自动重建',
      goals: 0,
    }
  } finally {
    db?.close()
  }
}
